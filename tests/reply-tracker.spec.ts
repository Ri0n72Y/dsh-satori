import { describe, expect, it } from 'vitest'
import { ReplyTracker } from '../src/reply-tracker.js'

const target = { platform: 'telegram', selfId: 'bot-1', channelId: 'room-1' }

describe('ReplyTracker', () => {
  it('only releases output after the Satori message is claimed into an exact completed turn', () => {
    const tracker = new ReplyTracker<{ id: string }>()
    const agent = { id: 'session-1' }

    tracker.queue(agent, 'message-1', target)
    tracker.assistant('session-1', 3, 'unrelated')
    expect(tracker.end('session-1', 3, { kind: 'completed' })).toBeUndefined()

    tracker.claim(agent, 'message-1', 4)
    tracker.assistant('session-1', 4, 'first')
    tracker.assistant('session-1', 4, 'final')
    expect(tracker.end('session-1', 4, { kind: 'completed' })).toEqual({ target, text: 'final' })
  })

  it.each(['error', 'aborted', 'blocked', 'interrupted'])('does not send stale text for %s turns', (kind: string) => {
    const tracker = new ReplyTracker<{ id: string }>()
    const agent = { id: 'session-1' }
    tracker.queue(agent, 'message-1', target)
    tracker.claim(agent, 'message-1', 1)
    tracker.assistant('session-1', 1, 'intermediate')
    expect(tracker.end('session-1', 1, { kind })).toBeUndefined()
  })

  it('keeps committed max-token text', () => {
    const tracker = new ReplyTracker<{ id: string }>()
    const agent = { id: 'session-1' }
    tracker.queue(agent, 'message-1', target)
    tracker.claim(agent, 'message-1', 1)
    tracker.assistant('session-1', 1, 'truncated')
    expect(tracker.end('session-1', 1, { kind: 'max-tokens' })).toEqual({ target, text: 'truncated' })
  })

  it('drops an exact failed claimed turn', () => {
    const tracker = new ReplyTracker<{ id: string }>()
    const agent = { id: 'session-1' }
    tracker.queue(agent, 'message-1', target)
    tracker.claim(agent, 'message-1', 1)
    tracker.assistant('session-1', 1, 'stale')
    tracker.failTurn(agent, 1)
    expect(tracker.end('session-1', 1, { kind: 'completed' })).toBeUndefined()
  })

  it('keeps only pending messages still present in the DSH inbox after an error', () => {
    const tracker = new ReplyTracker<{ id: string }>()
    const agent = { id: 'session-1' }
    tracker.queue(agent, 'kept', target)
    tracker.queue(agent, 'lost', target)
    tracker.discardAbsentPending(agent, new Set(['kept']))
    tracker.claim(agent, 'lost', 1)
    tracker.assistant('session-1', 1, 'wrong')
    expect(tracker.end('session-1', 1, { kind: 'completed' })).toBeUndefined()
    tracker.claim(agent, 'kept', 2)
    tracker.assistant('session-1', 2, 'right')
    expect(tracker.end('session-1', 2, { kind: 'completed' })).toEqual({ target, text: 'right' })
  })
})
