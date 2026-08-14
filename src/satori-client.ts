import { decodeSatoriServerPayload, SatoriOpcode, type SatoriEvent } from './satori-protocol.js'

export interface SatoriClientOptions {
  baseUrl: string
  token?: string
  onError?: (error: unknown) => void
  webSocketFactory?: (url: string) => WebSocketLike
  fetchImpl?: typeof fetch
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

export interface SatoriTarget {
  platform: string
  selfId: string
  channelId: string
}

interface CloseEventLike {
  code?: number
  reason?: string
}

interface MessageEventLike {
  data: unknown
}

interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open', listener: () => void): void
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void
  addEventListener(type: 'close', listener: (event: CloseEventLike) => void): void
  addEventListener(type: 'error', listener: () => void): void
}

type EventHandler = (event: SatoriEvent) => void | Promise<void>

const PING_INTERVAL_MS = 10_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const OPEN = 1
const INVALID_TOKEN_CLOSE_CODE = 4004

export class SatoriClient {
  private socket?: WebSocketLike
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private pingTimer?: ReturnType<typeof setInterval>
  private sequence?: number
  private reconnectAttempt = 0
  private stopped = true
  private reconnectBlocked = false
  private readonly handlers = new Set<EventHandler>()
  private readonly pendingHandlers = new Set<Promise<void>>()
  private readonly outbound = new Map<Promise<void>, AbortController>()

  constructor(private readonly options: SatoriClientOptions) {}

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.reconnectBlocked = false
    this.connect()
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.clearTimers()
    const socket = this.socket
    this.socket = undefined
    socket?.close(1000, 'dsh-satori stopped')
    for (const controller of this.outbound.values()) controller.abort()
    await Promise.allSettled([...this.pendingHandlers, ...this.outbound.keys()])
  }

  sendMessage(target: SatoriTarget, content: string): Promise<void> {
    if (this.stopped || this.reconnectBlocked) {
      return Promise.reject(new Error('dsh-satori Satori client is not available'))
    }

    const controller = new AbortController()
    const pending = this.performSend(target, content, controller.signal)
    this.outbound.set(pending, controller)
    void pending.finally(() => this.outbound.delete(pending)).catch(() => undefined)
    return pending
  }

  private async performSend(target: SatoriTarget, content: string, signal: AbortSignal): Promise<void> {
    const response = await (this.options.fetchImpl ?? fetch)(this.endpoint('v1/message.create'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'satori-platform': target.platform,
        'satori-user-id': target.selfId,
        ...this.authHeaders(),
      },
      body: JSON.stringify({
        channel_id: target.channelId,
        content,
      }),
      signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Satori message.create failed: ${response.status} ${detail}`.trim())
    }
  }

  private connect(): void {
    if (this.stopped || this.reconnectBlocked) return

    let socket: WebSocketLike
    try {
      socket = this.options.webSocketFactory?.(this.eventsUrl()) ?? new WebSocket(this.eventsUrl())
    } catch (error) {
      this.report(error)
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.addEventListener('open', () => {
      if (socket !== this.socket || this.stopped) return
      socket.send(JSON.stringify({
        op: SatoriOpcode.IDENTIFY,
        body: {
          token: this.options.token,
          sn: this.sequence,
        },
      }))
      this.startPing(socket)
    })

    socket.addEventListener('message', (message) => {
      if (socket !== this.socket || this.stopped) return
      this.handlePayload(message.data)
    })

    socket.addEventListener('close', (event) => {
      if (socket !== this.socket) return
      this.socket = undefined
      this.clearPing()
      if (this.stopped) return

      const code = event.code ?? 0
      const reason = event.reason ?? ''
      this.report(new Error(`Satori WebSocket closed: code=${code}${reason ? ` reason=${reason}` : ''}`))
      if (code === INVALID_TOKEN_CLOSE_CODE) {
        this.reconnectBlocked = true
        return
      }
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      if (socket !== this.socket) return
      socket.close()
    })
  }

  private handlePayload(data: unknown): void {
    const payload = decodeSatoriServerPayload(data)
    if (!payload) return

    if (payload.op === SatoriOpcode.READY) {
      this.reconnectAttempt = 0
      return
    }
    if (payload.op !== SatoriOpcode.EVENT) return

    const event = payload.body
    this.sequence = event.sn
    for (const handler of this.handlers) this.runHandler(handler, event)
  }

  private runHandler(handler: EventHandler, event: SatoriEvent): void {
    const pending = Promise.resolve().then(() => handler(event))
    this.pendingHandlers.add(pending)
    void pending.catch(error => this.report(error)).finally(() => {
      this.pendingHandlers.delete(pending)
    })
  }

  private startPing(socket: WebSocketLike): void {
    this.clearPing()
    this.pingTimer = setInterval(() => {
      if (socket !== this.socket || socket.readyState !== OPEN) return
      socket.send(JSON.stringify({ op: SatoriOpcode.PING, body: {} }))
    }, PING_INTERVAL_MS)
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectBlocked || this.reconnectTimer) return
    const base = this.options.reconnectBaseMs ?? RECONNECT_BASE_MS
    const max = this.options.reconnectMaxMs ?? RECONNECT_MAX_MS
    const delay = Math.min(base * 2 ** this.reconnectAttempt, max)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, delay)
  }

  private clearPing(): void {
    if (!this.pingTimer) return
    clearInterval(this.pingTimer)
    this.pingTimer = undefined
  }

  private clearTimers(): void {
    this.clearPing()
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
  }

  private report(error: unknown): void {
    this.options.onError?.(error)
  }

  private authHeaders(): Record<string, string> {
    return this.options.token
      ? { authorization: `Bearer ${this.options.token}` }
      : {}
  }

  private endpoint(path: string): string {
    return new URL(path, this.normalizedBaseUrl()).toString()
  }

  private eventsUrl(): string {
    const url = new URL('v1/events', this.normalizedBaseUrl())
    if (url.protocol === 'http:') url.protocol = 'ws:'
    if (url.protocol === 'https:') url.protocol = 'wss:'
    return url.toString()
  }

  private normalizedBaseUrl(): URL {
    const value = this.options.baseUrl.endsWith('/')
      ? this.options.baseUrl
      : `${this.options.baseUrl}/`
    return new URL(value)
  }
}
