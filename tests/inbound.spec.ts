import { describe, expect, it } from 'vitest'
import { compileAdmissionPolicy, inboundMessage, peerKey } from '../src/inbound.js'
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

const denyByDefault = compileAdmissionPolicy({
  allowedUsers: [],
  allowedChannels: [],
  allowedLogins: [],
  unsafeAllowAll: false,
})

const allowAll = compileAdmissionPolicy({
  allowedUsers: [],
  allowedChannels: [],
  allowedLogins: [],
  unsafeAllowAll: true,
})

describe('inboundMessage', () => {
  it('denies unlisted senders by default', () => {
    expect(inboundMessage(event, denyByDefault)).toBeUndefined()
  })

  it('accepts an explicitly allowed user and includes the sender in session identity', () => {
    const policy = compileAdmissionPolicy({
      allowedUsers: [peerKey('telegram', 'user-1')],
      allowedChannels: [],
      allowedLogins: [],
      unsafeAllowAll: false,
    })
    expect(inboundMessage(event, policy)).toMatchObject({
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

  it('keeps the source message id for group replies while direct replies stay unquoted', () => {
    const group = inboundMessage({
      ...event,
      channel: { id: 'room-1', type: 0 },
      message: { id: 'source-1', content: 'group question' },
    }, allowAll)
    const direct = inboundMessage(event, allowAll)

    expect(group?.target).toEqual({
      platform: 'telegram',
      selfId: 'bot-1',
      channelId: 'room-1',
      replyToMessageId: 'source-1',
    })
    expect(direct?.target).toEqual({ platform: 'telegram', selfId: 'bot-1', channelId: 'room-1' })
  })

  it('rejects a text-channel event without a source message id because its reply cannot be correlated', () => {
    expect(inboundMessage({ ...event, channel: { id: 'room-1', type: 0 } }, allowAll)).toBeUndefined()
  })

  it('accepts raw ids containing colons and canonicalizes encoded ids', () => {
    const matrixEvent: SatoriEvent = {
      ...event,
      platform: 'matrix',
      user: { id: '@alice:example.org' },
    }
    const raw = compileAdmissionPolicy({
      allowedUsers: ['matrix:@alice:example.org'],
      allowedChannels: [],
      allowedLogins: [],
      unsafeAllowAll: false,
    })
    const encoded = compileAdmissionPolicy({
      allowedUsers: ['matrix:%40alice%3Aexample.org'],
      allowedChannels: [],
      allowedLogins: [],
      unsafeAllowAll: false,
    })
    expect(inboundMessage(matrixEvent, raw)).toBeDefined()
    expect(inboundMessage(matrixEvent, encoded)).toBeDefined()
  })

  it('accepts an explicitly allowed channel', () => {
    const policy = compileAdmissionPolicy({
      allowedUsers: [],
      allowedChannels: ['telegram:room-1'],
      allowedLogins: [],
      unsafeAllowAll: false,
    })
    expect(inboundMessage(event, policy)).toBeDefined()
  })

  it('rejects the login selfId even when optional bot metadata is absent', () => {
    expect(inboundMessage({
      ...event,
      login: {},
      user: { id: 'bot-1' },
    }, allowAll)).toBeUndefined()
  })

  it('rejects bot-authored messages even when unsafeAllowAll is enabled', () => {
    expect(inboundMessage({ ...event, user: { id: 'other-bot', isBot: true } }, allowAll)).toBeUndefined()
  })

  it('can restrict the Satori login that is allowed to drive DSH', () => {
    const policy = compileAdmissionPolicy({
      allowedUsers: [],
      allowedChannels: [],
      allowedLogins: ['telegram:another-bot'],
      unsafeAllowAll: true,
    })
    expect(inboundMessage(event, policy)).toBeUndefined()
  })

  it('ignores messages whose Satori content contains no text nodes', () => {
    expect(inboundMessage({ ...event, message: { content: '<img src="x"/>' } }, allowAll)).toBeUndefined()
  })
})
