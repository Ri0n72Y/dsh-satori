import { afterEach, describe, expect, it, vi } from 'vitest'
import { SatoriClient } from '../src/satori-client.js'
import { SatoriOpcode } from '../src/satori-protocol.js'

class FakeSocket {
  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Set<(event: any) => void>>()

  addEventListener(type: string, listener: (event: any) => void): void {
    let handlers = this.listeners.get(type)
    if (!handlers) this.listeners.set(type, handlers = new Set())
    handlers.add(listener)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.emit('close', { code, reason })
  }

  open(): void {
    this.readyState = 1
    this.emit('open', {})
  }

  message(payload: unknown): void {
    this.emit('message', { data: JSON.stringify(payload) })
  }

  serverClose(code: number, reason: string): void {
    this.close(code, reason)
  }

  private emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function socketHarness(errors: unknown[] = []) {
  const sockets: FakeSocket[] = []
  const client = new SatoriClient({
    baseUrl: 'http://127.0.0.1:5140/satori',
    reconnectBaseMs: 1000,
    reconnectMaxMs: 30_000,
    onError: error => errors.push(error),
    webSocketFactory: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket as never
    },
  })
  return { client, sockets }
}

afterEach(() => vi.useRealTimers())

describe('SatoriClient reconnect lifecycle', () => {
  it('backs off repeated connections that never reach READY and resets only after READY', async () => {
    vi.useFakeTimers()
    const { client, sockets } = socketHarness()
    client.start()
    sockets[0].open()
    sockets[0].serverClose(1006, 'before ready')

    await vi.advanceTimersByTimeAsync(999)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(2)

    sockets[1].open()
    sockets[1].serverClose(1006, 'still before ready')
    await vi.advanceTimersByTimeAsync(1999)
    expect(sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(3)

    sockets[2].open()
    sockets[2].message({ op: SatoriOpcode.READY, body: { logins: [] } })
    sockets[2].serverClose(1006, 'after ready')
    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets).toHaveLength(4)
    await client.stop()
  })

  it('stops reconnecting on Satori invalid-token close and reports the close reason', async () => {
    vi.useFakeTimers()
    const errors: unknown[] = []
    const { client, sockets } = socketHarness(errors)
    client.start()
    sockets[0].open()
    sockets[0].serverClose(4004, 'invalid token')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(sockets).toHaveLength(1)
    expect(errors.map(String).join('\n')).toContain('4004')
    expect(errors.map(String).join('\n')).toContain('invalid token')
    await client.stop()
  })

  it('uses the last received event sequence in the next IDENTIFY', async () => {
    vi.useFakeTimers()
    const { client, sockets } = socketHarness()
    client.start()
    sockets[0].open()
    sockets[0].message({
      op: SatoriOpcode.EVENT,
      body: {
        sn: 17,
        type: 'message-created',
        login: {},
        self_id: 'bot',
        platform: 'telegram',
      },
    })
    sockets[0].serverClose(1006, 'restart')
    await vi.advanceTimersByTimeAsync(1000)
    sockets[1].open()

    const identify = sockets[1].sent.map(value => JSON.parse(value)).find(payload => payload.op === SatoriOpcode.IDENTIFY)
    expect(identify.body.sn).toBe(17)
    await client.stop()
  })
})

describe('SatoriClient outbound lifecycle', () => {
  it('sends group replies with the source quote and escaped assistant text', async () => {
    let requestBody: unknown
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const client = new SatoriClient({
      baseUrl: 'http://127.0.0.1:5140/satori',
      webSocketFactory: () => new FakeSocket() as never,
      fetchImpl,
    })
    client.start()

    await client.sendMessage({
      platform: 'telegram',
      selfId: 'bot',
      channelId: 'room',
      replyToMessageId: 'source-1',
    }, 'hello <at id="42"/>')

    expect(requestBody).toEqual({
      channel_id: 'room',
      content: '<quote id="source-1"/>hello &lt;at id="42"/&gt;',
    })
    await client.stop()
  })

  it('aborts in-flight HTTP sends during stop', async () => {
    let aborted = false
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('aborted', 'AbortError'))
      })
    })) as typeof fetch
    const client = new SatoriClient({
      baseUrl: 'http://127.0.0.1:5140/satori',
      webSocketFactory: () => new FakeSocket() as never,
      fetchImpl,
    })
    client.start()
    const sending = client.sendMessage({ platform: 'telegram', selfId: 'bot', channelId: 'room' }, 'hello')
    const stopping = client.stop()

    await expect(sending).rejects.toMatchObject({ name: 'AbortError' })
    await stopping
    expect(aborted).toBe(true)
    await expect(client.sendMessage({ platform: 'telegram', selfId: 'bot', channelId: 'room' }, 'late'))
      .rejects.toThrow('not available')
  })
})
