export const SatoriOpcode = {
  EVENT: 0,
  PING: 1,
  PONG: 2,
  IDENTIFY: 3,
  READY: 4,
  META: 5,
} as const

export const SatoriChannelType = {
  TEXT: 0,
  DIRECT: 1,
} as const

export interface SatoriUser {
  id: string
  isBot?: boolean
}

export interface SatoriChannel {
  id: string
  type?: number
}

export interface SatoriMessage {
  id?: string
  content?: string
  channel?: SatoriChannel
  user?: SatoriUser
}

export interface SatoriLogin {
  user?: SatoriUser
  platform?: string
}

export interface SatoriEvent {
  sn: number
  type: string
  login: SatoriLogin
  selfId: string
  platform: string
  channel?: SatoriChannel
  message?: SatoriMessage
  user?: SatoriUser
}

export type SatoriServerPayload =
  | { op: typeof SatoriOpcode.EVENT; body: SatoriEvent }
  | { op: typeof SatoriOpcode.PONG; body: Record<string, never> }
  | { op: typeof SatoriOpcode.READY; body: unknown }
  | { op: typeof SatoriOpcode.META; body: unknown }

export function decodeSatoriServerPayload(data: unknown): SatoriServerPayload | undefined {
  const text = payloadText(data)
  if (text === undefined) return

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return
  }

  const normalized = camelizeWireValue(parsed)
  if (!isRecord(normalized) || typeof normalized.op !== 'number' || !('body' in normalized)) return
  return normalized as SatoriServerPayload
}

function payloadText(data: unknown): string | undefined {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  }
}

function camelizeWireValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeWireValue)
  if (!isRecord(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    camelizeWireKey(key),
    camelizeWireValue(child),
  ]))
}

function camelizeWireKey(key: string): string {
  if (key.startsWith('_') || key === 'referrer') return key
  return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
