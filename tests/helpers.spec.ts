import { describe, expect, it } from 'vitest'
import { assistantText } from '../src/message.js'
import { sessionKeyFor } from '../src/session-id.js'

const identity = {
  platform: 'matrix',
  selfId: '@bot:example.org',
  channelId: '!a-very-long-room-id:example.org',
  userId: '@alice:example.org',
}

describe('sessionKeyFor', () => {
  it('is deterministic, bounded, and does not expose raw external ids', () => {
    const key = sessionKeyFor(identity)
    expect(key).toBe(sessionKeyFor(identity))
    expect(key.length).toBeLessThanOrEqual(74)
    expect(key).not.toContain('@alice')
    expect(key).not.toContain('a-very-long-room-id')
  })

  it('changes when any identity component changes', () => {
    expect(sessionKeyFor(identity)).not.toBe(sessionKeyFor({ ...identity, userId: '@bob:example.org' }))
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
