import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-session-persistence'
import { SessionId } from '@deepseek-ai/dsh-session'
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
}

export function sessionIdFor(identity: SessionIdentity, prefix = 'satori'): SessionId {
  return SessionId(sessionKeyFor(identity, prefix))
}

export class SessionRouter {
  private readonly owned = new Map<SessionId, OwnedAgent>()
  private readonly opening = new Map<SessionId, Promise<Agent>>()

  constructor(
    private readonly ctx: Context,
    private readonly options: SessionRouterOptions,
  ) {}

  async get(identity: SessionIdentity): Promise<Agent> {
    const sessionId = sessionIdFor(identity, this.options.prefix)
    const live = this.ctx.agents.get(sessionId)
    const owned = this.owned.get(sessionId)

    if (live) {
      if (owned && owned.handle.agent === live) owned.lastUsedAt = Date.now()
      else if (owned) this.owned.delete(sessionId)
      return live
    }

    if (owned) {
      this.owned.delete(sessionId)
      await owned.handle.dispose()
    }

    const opening = this.opening.get(sessionId)
    if (opening) return opening

    const task = this.open(sessionId)
    this.opening.set(sessionId, task)
    try {
      return await task
    } finally {
      this.opening.delete(sessionId)
    }
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.owned.values()].map(({ handle }) => handle.dispose()))
    this.owned.clear()
  }

  private async open(sessionId: SessionId): Promise<Agent> {
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

    this.owned.set(sessionId, { handle, lastUsedAt: Date.now() })
    return handle.agent
  }

  private async ensureCapacity(): Promise<void> {
    const now = Date.now()
    await this.disposeWhere(({ handle, lastUsedAt }) => (
      handle.agent.status === 'idle' && now - lastUsedAt >= this.options.idleTtlMs
    ))

    while (this.owned.size >= this.options.maxLiveAgents) {
      const oldestIdle = [...this.owned.entries()]
        .filter(([, { handle }]) => handle.agent.status === 'idle')
        .sort(([, a], [, b]) => a.lastUsedAt - b.lastUsedAt)[0]
      if (!oldestIdle) {
        throw new Error(`dsh-satori reached maxLiveAgents=${this.options.maxLiveAgents}; all owned agents are busy`)
      }
      const [sessionId, entry] = oldestIdle
      this.owned.delete(sessionId)
      await entry.handle.dispose()
    }
  }

  private async disposeWhere(predicate: (entry: OwnedAgent) => boolean): Promise<void> {
    const disposals: Promise<void>[] = []
    for (const [sessionId, entry] of this.owned) {
      if (!predicate(entry)) continue
      this.owned.delete(sessionId)
      disposals.push(entry.handle.dispose())
    }
    await Promise.allSettled(disposals)
  }
}
