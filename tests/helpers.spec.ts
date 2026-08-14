import { describe, expect, it } from 'vitest'
import { assistantText } from '../src/message.js'
import { sessionKeyFor } from '../src/session-id.js'

describe('sessionKeyFor', () => {
  it('keeps one stable DSH session per Satori login, channel, and sender', () => {
    expect(sessionKeyFor({
      platform: 'telegram',
      selfId: 'bot:1',
      channelId: 'room/42',
      userId: 'user:7',
    })).toBe('satori:telegram:bot%3A1:room%2F42:user%3A7')
  })
})

describe('assistantText', () => {
  it('returns visible text and skips non-text blocks', () => {
    const text = assistantText({
      content: [
        { type: 'reasoning', text: 'hidden' },
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
      ],
    } as never)

    expect(text).toBe('hello world')
  })
})
