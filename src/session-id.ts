import { createHash } from 'node:crypto'

export interface SessionIdentity {
  platform: string
  selfId: string
  channelId: string
  userId: string
}

const LABEL_LENGTH = 20
const DIGEST_LENGTH = 32

export function sessionKeyFor(
  identity: SessionIdentity,
  prefix = 'satori',
  workspacePath?: string,
): string {
  const parts = [prefix, identity.platform, identity.selfId, identity.channelId, identity.userId]
  if (workspacePath !== undefined) parts.push(workspacePath)
  const digest = createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('base64url')
    .slice(0, DIGEST_LENGTH)
  return `${label(prefix)}:${label(identity.platform)}:${digest}`
}

function label(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return (normalized || 'x').slice(0, LABEL_LENGTH)
}
