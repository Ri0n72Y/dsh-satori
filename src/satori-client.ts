import { decodeSatoriServerPayload, SatoriOpcode, type SatoriEvent } from './satori-protocol.js'

export interface SatoriClientOptions {
  baseUrl: string
  token?: string
  onError?: (error: unknown) => void
}

export interface SatoriTarget {
  platform: string
  selfId: string
  channelId: string
}

type EventHandler = (event: SatoriEvent) => void | Promise<void>

const PING_INTERVAL_MS = 10_000
const RECONNECT_MAX_MS = 30_000

export class SatoriClient {
  private socket?: WebSocket
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private pingTimer?: ReturnType<typeof setInterval>
  private sequence?: number
  private reconnectAttempt = 0
  private stopped = true
  private readonly handlers = new Set<EventHandler>()
  private readonly pending = new Set<Promise<void>>()

  constructor(private readonly options: SatoriClientOptions) {}

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.connect()
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.clearTimers()
    const socket = this.socket
    this.socket = undefined
    socket?.close(1000, 'dsh-satori stopped')
    await Promise.allSettled([...this.pending])
  }

  async sendMessage(target: SatoriTarget, content: string): Promise<void> {
    const response = await fetch(this.endpoint('v1/message.create'), {
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
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Satori message.create failed: ${response.status} ${detail}`.trim())
    }
  }

  private connect(): void {
    if (this.stopped) return

    let socket: WebSocket
    try {
      socket = new WebSocket(this.eventsUrl())
    } catch (error) {
      this.report(error)
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.addEventListener('open', () => {
      if (socket !== this.socket || this.stopped) return
      this.reconnectAttempt = 0
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

    socket.addEventListener('close', () => {
      if (socket !== this.socket) return
      this.socket = undefined
      this.clearPing()
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      if (socket !== this.socket) return
      socket.close()
    })
  }

  private handlePayload(data: unknown): void {
    const payload = decodeSatoriServerPayload(data)
    if (!payload || payload.op !== SatoriOpcode.EVENT) return

    const event = payload.body
    this.sequence = event.sn
    for (const handler of this.handlers) this.runHandler(handler, event)
  }

  private runHandler(handler: EventHandler, event: SatoriEvent): void {
    const pending = Promise.resolve().then(() => handler(event))
    this.pending.add(pending)
    void pending.catch(error => this.report(error)).finally(() => {
      this.pending.delete(pending)
    })
  }

  private startPing(socket: WebSocket): void {
    this.clearPing()
    this.pingTimer = setInterval(() => {
      if (socket !== this.socket || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ op: SatoriOpcode.PING, body: {} }))
    }, PING_INTERVAL_MS)
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS)
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
