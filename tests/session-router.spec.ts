import { describe, expect, it } from 'vitest'
import { SessionRouter } from '../src/session-router.js'

interface FakeAgent {
  id: string
  status: 'idle' | 'running'
}

interface FakeCreateOptions {
  sessionId: string
  meta?: { cwd?: string }
}

function identity(userId: string) {
  return { platform: 'telegram', selfId: 'bot', channelId: 'room', userId }
}

function harness(options: {
  failDispose?: boolean
  detachOnDisposeFailure?: boolean
  delayedCreate?: boolean
  cwd?: string | null
} = {}) {
  const live = new Map<string, FakeAgent>()
  const creates: FakeCreateOptions[] = []
  let createCount = 0
  let disposeCount = 0
  let maxObserved = 0
  let releaseCreate: (() => void) | undefined
  const createGate = options.delayedCreate
    ? new Promise<void>(resolve => { releaseCreate = resolve })
    : Promise.resolve()

  const agents = {
    get(id: string) {
      return live.get(id)
    },
    async create(createOptions: FakeCreateOptions) {
      createCount += 1
      creates.push(createOptions)
      await createGate
      const agent: FakeAgent = { id: createOptions.sessionId, status: 'idle' }
      live.set(createOptions.sessionId, agent)
      maxObserved = Math.max(maxObserved, live.size)

      let disposing: Promise<void> | undefined
      const dispose = () => disposing ??= (async () => {
        disposeCount += 1
        if (options.failDispose) {
          if (options.detachOnDisposeFailure) live.delete(createOptions.sessionId)
          throw new Error('dispose failed')
        }
        live.delete(createOptions.sessionId)
      })()

      return { agent, dispose }
    },
    async resume({ resumeSessionId }: { resumeSessionId: string }) {
      return this.create({ sessionId: resumeSessionId })
    },
  }
  const ctx = {
    agents,
    sessionPersistence: { async list() { return [] } },
  }
  const router = new SessionRouter(ctx as never, {
    prefix: 'satori',
    cwd: options.cwd === null ? undefined : (options.cwd ?? '/tmp'),
    maxLiveAgents: 1,
    idleTtlMs: 60_000,
  })
  return {
    router,
    live,
    releaseCreate: () => releaseCreate?.(),
    creates: () => [...creates],
    stats: () => ({ createCount, disposeCount, maxObserved }),
  }
}

describe('SessionRouter', () => {
  it('omits cwd metadata when the plugin workspace is not configured', async () => {
    const { router, creates } = harness({ cwd: null })
    await router.withAgent(identity('one'), () => undefined)

    expect(creates()).toHaveLength(1)
    expect(creates()[0]?.meta).toEqual({})
    await router.dispose()
  })

  it('passes an explicitly configured workspace into fresh DSH session metadata', async () => {
    const { router, creates } = harness({ cwd: '/safe/workspace' })
    await router.withAgent(identity('one'), () => undefined)

    expect(creates()[0]?.meta).toEqual({ cwd: '/safe/workspace' })
    await router.dispose()
  })

  it('keeps acquisition plus synchronous followup inside one capacity critical section', async () => {
    const { router, stats } = harness()
    const first = router.withAgent(identity('one'), (agent) => {
      ;(agent as unknown as FakeAgent).status = 'running'
    })
    const second = router.withAgent(identity('two'), () => undefined)

    await first
    await expect(second).rejects.toThrow('all owned agents are busy')
    expect(stats()).toMatchObject({ createCount: 1, maxObserved: 1 })
    await router.dispose()
  })

  it('surfaces a memoized teardown rejection but releases capacity after DSH detached the agent', async () => {
    const { router, stats } = harness({ failDispose: true, detachOnDisposeFailure: true })
    let firstAgent: unknown
    await router.withAgent(identity('one'), (agent) => { firstAgent = agent })

    await expect(router.withAgent(identity('two'), () => undefined)).rejects.toThrow('dispose failed')
    expect(router.owns(firstAgent as never)).toBe(false)
    expect(stats()).toMatchObject({ createCount: 1, disposeCount: 1, maxObserved: 1 })
  })

  it('keeps a still-live agent poisoned after memoized teardown failure and never retries its disposer', async () => {
    const { router, stats } = harness({ failDispose: true, detachOnDisposeFailure: false })
    let firstAgent: unknown
    await router.withAgent(identity('one'), (agent) => { firstAgent = agent })

    await expect(router.withAgent(identity('two'), () => undefined)).rejects.toThrow('dispose failed')
    expect(router.owns(firstAgent as never)).toBe(true)
    expect(stats()).toMatchObject({ createCount: 1, disposeCount: 1 })

    await expect(router.withAgent(identity('two'), () => undefined)).rejects.toThrow('previously failed teardown')
    expect(stats().disposeCount).toBe(1)
    await expect(router.dispose()).rejects.toThrow('failed to dispose 1 owned agent')
    expect(stats().disposeCount).toBe(1)
  })

  it('disposes a handle created after router teardown begins', async () => {
    const { router, releaseCreate, stats } = harness({ delayedCreate: true })
    const delivery = router.withAgent(identity('one'), () => undefined)
    while (stats().createCount === 0) await Promise.resolve()
    const stopping = router.dispose()
    releaseCreate()

    await expect(delivery).rejects.toThrow('disposed during agent creation')
    await stopping
    expect(stats()).toMatchObject({ createCount: 1, disposeCount: 1 })
  })
})
