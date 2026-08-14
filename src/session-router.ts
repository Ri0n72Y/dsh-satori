import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'

export interface SessionIdentity {
  platform: string
  selfId: string
  channelId: string
}

export interface SessionRouterOptions {
  prefix: string
  cwd: string
  agentOptions?: AgentOptions
}

export function sessionIdFor(identity: SessionIdentity, prefix = 'satori'): SessionId {
  const parts = [prefix, identity.platform, identity.selfId, identity.channelId]
    .map(part => encodeURIComponent(part))
  return SessionId(parts.join(':'))
}

export class SessionRouter {
  private readonly owned = new Map<SessionId, AgentHandle>()
  private readonly opening = new Map<SessionId, Promise<Agent>>()

  constructor(
    private readonly ctx: Context,
    private readonly options: SessionRouterOptions,
  ) {}

  async get(identity: SessionIdentity): Promise<Agent> {
    const sessionId = sessionIdFor(identity, this.options.prefix)

    const live = this.ctx.agents.get(sessionId)
    if (live) return live

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
    await Promise.allSettled([...this.owned.values()].map(handle => handle.dispose()))
    this.owned.clear()
  }

  private async open(sessionId: SessionId): Promise<Agent> {
    let resumeError: unknown

    try {
      const handle = await this.ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: this.options.agentOptions,
      })
      this.owned.set(sessionId, handle)
      return handle.agent
    } catch (error) {
      resumeError = error
    }

    try {
      const handle = await this.ctx.agents.create({
        sessionId,
        meta: { cwd: this.options.cwd },
        agentOptions: this.options.agentOptions,
      })
      this.owned.set(sessionId, handle)
      return handle.agent
    } catch (createError) {
      throw new AggregateError(
        [resumeError, createError],
        `Unable to resume or create DSH session ${sessionId}`,
      )
    }
  }
}
