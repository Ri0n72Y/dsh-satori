import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { sessionKeyFor, type SessionIdentity } from './session-id.js'

export interface SessionRouterOptions {
  prefix: string
  cwd: string
  agentOptions?: AgentOptions
  maxLiveAgents: number
  idleTtlMs: number
}

interface OwnedAgent {
  handle: AgentHandle
  lastUsedAt: number
  disposeError?: unknown
}

type AgentUse<T> = (agent: Agent) => T | Promise<T>

export function sessionIdFor(identity: SessionIdentity, prefix = 'satori'): SessionId {
  return sessionKeyFor(identity, prefix) as SessionId
}

export class SessionRouter {
  private readonly owned = new Map<SessionId, OwnedAgent>()
  private gate: Promise<void> = Promise.resolve()
  private closed = false

  constructor(
    private readonly ctx: Context,
    private readonly options: SessionRouterOptions,
  ) {}

  withAgent<T>(identity: SessionIdentity, use: AgentUse<T>): Promise<T> {
    return this.exclusive(async () => {
      if (this.closed) throw new Error('dsh-satori session router is disposed')
      const sessionId = sessionIdFor(identity, this.options.prefix)
      const agent = await this.resolveAgent(sessionId)
      if (this.ctx.agents.get(sessionId) !== agent) {
        throw new Error(`dsh-satori agent ${sessionId} was disposed before delivery`)
      }
      return use(agent)
    })
  }

  owns(agent: Agent): boolean {
    const owned = this.owned.get(agent.id)
    return owned?.handle.agent === agent
  }

  async dispose(): Promise<void> {
    this.closed = true
    await this.exclusive(async () => {
      const failures: unknown[] = []
      for (const [sessionId, entry] of [...this.owned]) {
        try {
          await this.disposeOwned(sessionId, entry)
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, `dsh-satori failed to dispose ${failures.length} owned agent(s)`)
      }
    })
  }

  private async resolveAgent(sessionId: SessionId): Promise<Agent> {
    const live = this.ctx.agents.get(sessionId)
    const owned = this.owned.get(sessionId)
    if (live) {
      if (owned && owned.handle.agent === live) {
        if (owned.disposeError !== undefined) throw teardownFailed(sessionId, owned.disposeError)
        owned.lastUsedAt = Date.now()
      } else if (owned) {
        await this.disposeOwned(sessionId, owned)
      }
      return live
    }

    if (owned) await this.disposeOwned(sessionId, owned)
    await this.ensureCapacity()

    const persisted = (await this.ctx.sessionPersistence.list())
      .some(header => header.id === sessionId)
    const handle = persisted
      ? await this.ctx.agents.resume({
          resumeSessionId: sessionId,
          agentOptions: this.options.agentOptions,
        })
      : await this.ctx.agents.create({
          sessionId,
          meta: { cwd: this.options.cwd },
          agentOptions: this.options.agentOptions,
        })

    if (this.closed) {
      await handle.dispose()
      throw new Error('dsh-satori session router was disposed during agent creation')
    }
    if (this.ctx.agents.get(sessionId) !== handle.agent) {
      await handle.dispose()
      throw new Error(`dsh-satori agent ${sessionId} was not live after creation`)
    }

    this.owned.set(sessionId, { handle, lastUsedAt: Date.now() })
    return handle.agent
  }

  private async ensureCapacity(): Promise<void> {
    const now = Date.now()
    const expired = [...this.owned.entries()]
      .filter(([, { handle, lastUsedAt }]) => (
        handle.agent.status === 'idle' && now - lastUsedAt >= this.options.idleTtlMs
      ))
      .sort(([, a], [, b]) => a.lastUsedAt - b.lastUsedAt)
    for (const [sessionId, entry] of expired) await this.disposeOwned(sessionId, entry)

    while (this.owned.size >= this.options.maxLiveAgents) {
      const oldestIdle = [...this.owned.entries()]
        .filter(([, { handle }]) => handle.agent.status === 'idle')
        .sort(([, a], [, b]) => a.lastUsedAt - b.lastUsedAt)[0]
      if (!oldestIdle) {
        throw new Error(`dsh-satori reached maxLiveAgents=${this.options.maxLiveAgents}; all owned agents are busy`)
      }
      await this.disposeOwned(oldestIdle[0], oldestIdle[1])
    }
  }

  private async disposeOwned(sessionId: SessionId, entry: OwnedAgent): Promise<void> {
    if (entry.disposeError !== undefined) {
      if (this.ctx.agents.get(sessionId) !== entry.handle.agent) {
        if (this.owned.get(sessionId) === entry) this.owned.delete(sessionId)
        return
      }
      throw teardownFailed(sessionId, entry.disposeError)
    }

    try {
      await entry.handle.dispose()
      if (this.owned.get(sessionId) === entry) this.owned.delete(sessionId)
    } catch (error) {
      // DSH AgentHandle teardown is memoized. A second dispose() returns the
      // same settlement, so retrying a rejected disposer cannot repair it.
      // The default loop still detaches agent/session in teardown's finally;
      // release capacity only when the registry confirms that detach happened.
      if (this.ctx.agents.get(sessionId) !== entry.handle.agent) {
        if (this.owned.get(sessionId) === entry) this.owned.delete(sessionId)
      } else {
        entry.disposeError = error
      }
      throw error
    }
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.gate.then(task, task)
    this.gate = run.then(() => undefined, () => undefined)
    return run
  }
}

function teardownFailed(sessionId: SessionId, cause: unknown): Error {
  return new Error(`dsh-satori agent ${sessionId} has a previously failed teardown`, { cause })
}
