import { describe, expect, it } from 'vitest'
import { ReplyTracker } from '../src/reply-tracker.js'

const target = { platform: 'telegram', selfId: 'bot-1', channelId: 'room-1' }

describe('ReplyTracker', () => {
  it('only releases output after the Satori message is claimed into an exact turn', () => {
    const tracker = new ReplyTracker<{ id: string }>()
    const agent = { id: 'session-1' }

    tracker.queue(agent, 'message-1', target)
    tracker.assistant('session-1', 3, 'unrelated')
    expect(tracker.end('session-1', 3)).toBeUndefined()

    tracker.claim(agent, 'message-1', 4)
    tracker.assistant('session-1', 4, 'first')
    tracker.assistant('session-1', 4, 'final')
    expect(tracker.end('session-1', 4)).toEqual({ target, text: 'final' })
  })

  it('does not let another agent claim a pending message', () => {
    const tracker = new ReplyTracker<{ id: string }>()
    const owner = { id: 'session-1' }
    const other = { id: 'session-2' }

    tracker.queue(owner, 'message-1', target)
    tracker.claim(other, 'message-1', 1)
    tracker.assistant('session-2', 1, 'wrong')
    expect(tracker.end('session-2', 1)).toBeUndefined()
  })

  it('drops pending work when the inbox discards it', () => {
    const tracker = new ReplyTracker<{ id: string }>()
    const agent = { id: 'session-1' }

    tracker.queue(agent, 'message-1', target)
    tracker.discard(agent, 'message-1')
    tracker.claim(agent, 'message-1', 1)
    tracker.assistant('session-1', 1, 'wrong')
    expect(tracker.end('session-1', 1)).toBeUndefined()
  })
})
