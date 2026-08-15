import type { SatoriTarget } from './satori-client.js'

interface AgentLike {
  id: string
}

interface PendingReply<TAgent extends AgentLike> {
  agent: TAgent
  target: SatoriTarget
}

interface ClaimedTurn<TAgent extends AgentLike> extends PendingReply<TAgent> {
  text?: string
}

export interface CompletedReply {
  target: SatoriTarget
  text: string
}

export interface TurnEndLike {
  kind: string
}

export class ReplyTracker<TAgent extends AgentLike> {
  private readonly pending = new Map<string, PendingReply<TAgent>>()
  private readonly turns = new Map<string, ClaimedTurn<TAgent>>()

  queue(agent: TAgent, messageId: string, target: SatoriTarget): void {
    this.pending.set(messageId, { agent, target })
  }

  claim(agent: TAgent, messageId: string, turn: number): void {
    const pending = this.pending.get(messageId)
    if (!pending || pending.agent !== agent) return
    this.pending.delete(messageId)
    this.turns.set(turnKey(agent.id, turn), pending)
  }

  discard(agent: TAgent, messageId: string): void {
    const pending = this.pending.get(messageId)
    if (pending?.agent === agent) this.pending.delete(messageId)
  }

  discardAbsentPending(agent: TAgent, presentMessageIds: ReadonlySet<string>): void {
    for (const [messageId, pending] of this.pending) {
      if (pending.agent === agent && !presentMessageIds.has(messageId)) this.pending.delete(messageId)
    }
  }

  assistant(sessionId: string, turn: number, text: string): void {
    const claimed = this.turns.get(turnKey(sessionId, turn))
    if (!claimed) return
    if (text) claimed.text = text
    else delete claimed.text
  }

  failTurn(agent: TAgent, turn: number): void {
    const key = turnKey(agent.id, turn)
    const claimed = this.turns.get(key)
    if (claimed?.agent === agent) this.turns.delete(key)
  }

  end(sessionId: string, turn: number, reason: TurnEndLike): CompletedReply | undefined {
    const key = turnKey(sessionId, turn)
    const claimed = this.turns.get(key)
    this.turns.delete(key)
    if (reason.kind !== 'completed' && reason.kind !== 'max-tokens') return
    if (!claimed?.text) return
    return { target: claimed.target, text: claimed.text }
  }

  dropAgent(agent: TAgent): void {
    for (const [messageId, pending] of this.pending) {
      if (pending.agent === agent) this.pending.delete(messageId)
    }
    for (const [key, claimed] of this.turns) {
      if (claimed.agent === agent) this.turns.delete(key)
    }
  }

  clear(): void {
    this.pending.clear()
    this.turns.clear()
  }
}

function turnKey(sessionId: string, turn: number): string {
  return `${sessionId}:${turn}`
}
