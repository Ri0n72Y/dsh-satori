import { describe, expect, it } from 'vitest'
import { inboundMessage, peerKey } from '../src/inbound.js'
import type { SatoriEvent } from '../src/satori-protocol.js'

const event: SatoriEvent = {
  sn: 1,
  type: 'message-created',
  login: { user: { id: 'bot-1', isBot: true } },
  selfId: 'bot-1',
  platform: 'telegram',
  channel: { id: 'room-1', type: 1 },
  user: { id: 'user-1', isBot: false },
  message: { content: ' hello ' },
}

const denyByDefault = {
  allowedUsers: [],
  allowedChannels: [],
  allowedLogins: [],
  unsafeAllowAll: false,
}

describe('inboundMessage', () => {
  it('denies unlisted senders by default', () => {
    expect(inboundMessage(event, denyByDefault)).toBeUndefined()
  })

  it('accepts an explicitly allowed user and includes the sender in session identity', () => {
    expect(inboundMessage(event, {
      ...denyByDefault,
      allowedUsers: [peerKey('telegram', 'user-1')],
    })).toMatchObject({
      text: 'hello',
      target: { platform: 'telegram', selfId: 'bot-1', channelId: 'room-1' },
      identity: {
        platform: 'telegram',
        selfId: 'bot-1',
        channelId: 'room-1',
        userId: 'user-1',
      },
    })
  })

  it('accepts an explicitly allowed channel', () => {
    expect(inboundMessage(event, {
      ...denyByDefault,
      allowedChannels: [peerKey('telegram', 'room-1')],
    })).toBeDefined()
  })

  it('rejects bot-authored messages even when unsafeAllowAll is enabled', () => {
    expect(inboundMessage({ ...event, user: { id: 'other-bot', isBot: true } }, {
      ...denyByDefault,
      unsafeAllowAll: true,
    })).toBeUndefined()
  })

  it('can restrict the Satori login that is allowed to drive DSH', () => {
    expect(inboundMessage(event, {
      ...denyByDefault,
      unsafeAllowAll: true,
      allowedLogins: [peerKey('telegram', 'another-bot')],
    })).toBeUndefined()
  })
})
