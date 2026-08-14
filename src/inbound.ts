import type { SatoriTarget } from './satori-client.js'
import type { SatoriEvent } from './satori-protocol.js'
import type { SessionIdentity } from './session-id.js'

export interface AdmissionPolicy {
  allowedUsers: readonly string[]
  allowedChannels: readonly string[]
  allowedLogins: readonly string[]
  unsafeAllowAll: boolean
}

export interface InboundMessage {
  target: SatoriTarget
  identity: SessionIdentity
  text: string
}

export function peerKey(platform: string, id: string): string {
  return `${encodeURIComponent(platform)}:${encodeURIComponent(id)}`
}

export function inboundMessage(
  event: SatoriEvent,
  policy: AdmissionPolicy,
): InboundMessage | undefined {
  if (event.type !== 'message-created') return

  const channelId = event.channel?.id ?? event.message?.channel?.id
  const selfId = event.selfId
  const platform = event.platform
  const user = event.user ?? event.message?.user
  const userId = user?.id
  const selfUserId = event.login.user?.id
  const text = event.message?.content?.trim()

  if (!channelId || !selfId || !platform || !userId || !text) return
  if (selfUserId === userId || user?.isBot === true) return

  const loginAllowed = policy.allowedLogins.length === 0
    || policy.allowedLogins.includes(peerKey(platform, selfId))
  if (!loginAllowed) return

  const admitted = policy.unsafeAllowAll
    || policy.allowedUsers.includes(peerKey(platform, userId))
    || policy.allowedChannels.includes(peerKey(platform, channelId))
  if (!admitted) return

  return {
    target: { platform, selfId, channelId },
    identity: { platform, selfId, channelId, userId },
    text,
  }
}
