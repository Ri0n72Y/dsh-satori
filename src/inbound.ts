import type { SatoriTarget } from './satori-client.js'
import { plainTextFromSatori } from './satori-message.js'
import { SatoriChannelType, type SatoriEvent } from './satori-protocol.js'
import type { SessionIdentity } from './session-id.js'

export interface AdmissionConfig {
  allowedUsers: readonly string[]
  allowedChannels: readonly string[]
  allowedLogins: readonly string[]
  unsafeAllowAll: boolean
}

export interface AdmissionPolicy {
  allowedUsers: ReadonlySet<string>
  allowedChannels: ReadonlySet<string>
  allowedLogins: ReadonlySet<string>
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

export function compileAdmissionPolicy(config: AdmissionConfig): AdmissionPolicy {
  return {
    allowedUsers: canonicalPeers(config.allowedUsers),
    allowedChannels: canonicalPeers(config.allowedChannels),
    allowedLogins: canonicalPeers(config.allowedLogins),
    unsafeAllowAll: config.unsafeAllowAll,
  }
}

export function inboundMessage(
  event: SatoriEvent,
  policy: AdmissionPolicy,
): InboundMessage | undefined {
  if (event.type !== 'message-created') return

  const channel = event.channel ?? event.message?.channel
  const channelId = channel?.id
  const selfId = event.selfId
  const platform = event.platform
  const user = event.user ?? event.message?.user
  const userId = user?.id
  const selfUserId = event.login.user?.id
  const content = event.message?.content
  const sourceMessageId = event.message?.id

  if (!channelId || !selfId || !platform || !userId || !content) return
  if (userId === selfId || selfUserId === userId || user?.isBot === true) return
  if (channel?.type === SatoriChannelType.TEXT && !sourceMessageId) return

  const loginAllowed = policy.allowedLogins.size === 0
    || policy.allowedLogins.has(peerKey(platform, selfId))
  if (!loginAllowed) return

  const admitted = policy.unsafeAllowAll
    || policy.allowedUsers.has(peerKey(platform, userId))
    || policy.allowedChannels.has(peerKey(platform, channelId))
  if (!admitted) return

  const text = plainTextFromSatori(content)
  if (!text) return

  return {
    target: {
      platform,
      selfId,
      channelId,
      ...(channel?.type === SatoriChannelType.TEXT && sourceMessageId ? { replyToMessageId: sourceMessageId } : {}),
    },
    identity: { platform, selfId, channelId, userId },
    text,
  }
}

function canonicalPeers(values: readonly string[]): ReadonlySet<string> {
  const result = new Set<string>()
  for (const value of values) {
    const canonical = canonicalPeer(value.trim())
    if (canonical) result.add(canonical)
  }
  return result
}

function canonicalPeer(value: string): string | undefined {
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) return
  const platform = decodeSegment(value.slice(0, separator))
  const id = decodeSegment(value.slice(separator + 1))
  return peerKey(platform, id)
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
