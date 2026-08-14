export interface SessionIdentity {
  platform: string
  selfId: string
  channelId: string
  userId: string
}

export function sessionKeyFor(identity: SessionIdentity, prefix = 'satori'): string {
  const parts = [prefix, identity.platform, identity.selfId, identity.channelId, identity.userId]
    .map(part => encodeURIComponent(part))
  return parts.join(':')
}
