export const SatoriOpcode = {
  EVENT: 0,
  PING: 1,
  PONG: 2,
  IDENTIFY: 3,
  READY: 4,
  META: 5,
} as const

export interface SatoriUser {
  id: string
}

export interface SatoriChannel {
  id: string
}

export interface SatoriMessage {
  content?: string
  channel?: SatoriChannel
  user?: SatoriUser
}

export interface SatoriLogin {
  user?: SatoriUser
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
