import { describe, expect, it } from 'vitest'
import { decodeSatoriServerPayload, SatoriOpcode } from '../src/satori-protocol.js'

describe('decodeSatoriServerPayload', () => {
  it('normalizes Satori server snake_case fields before exposing events', () => {
    const payload = decodeSatoriServerPayload(JSON.stringify({
      op: SatoriOpcode.EVENT,
      body: {
        sn: 7,
        type: 'message-created',
        login: {
          user: { id: 'bot-1', is_bot: true },
        },
        self_id: 'bot-1',
        platform: 'telegram',
        channel: { id: 'dm-9', type: 1 },
        user: { id: 'user-2', is_bot: false },
        message: {
          content: 'hello',
          channel: { id: 'dm-9' },
        },
      },
    }))

    expect(payload).toMatchObject({
      op: SatoriOpcode.EVENT,
      body: {
        sn: 7,
        selfId: 'bot-1',
        login: { user: { id: 'bot-1', isBot: true } },
        user: { id: 'user-2', isBot: false },
      },
    })
  })

  it('ignores invalid JSON', () => {
    expect(decodeSatoriServerPayload('{')).toBeUndefined()
  })
})
