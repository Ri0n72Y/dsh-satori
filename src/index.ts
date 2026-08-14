import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import Schema from '@deepseek-ai/schemastery'

import { assistantText } from './message.js'
import { SatoriClient, type SatoriTarget } from './satori-client.js'
import type { SatoriEvent } from './satori-protocol.js'
import { SessionRouter } from './session-router.js'

export const name = 'dsh-satori'
export const inject = ['agents', 'sessions']

export interface Config {
  baseUrl: string
  token?: string
  sessionPrefix: string
  cwd?: string
  provider?: string
  model?: string
}

export const Config: Schema<Config> = Schema.object({
  baseUrl: Schema.string()
    .description('Satori server base URL')
    .default('http://127.0.0.1:5140/satori'),
  token: Schema.string().description('Satori server token'),
  sessionPrefix: Schema.string()
    .description('Prefix used for deterministic DSH session IDs')
    .default('satori'),
  cwd: Schema.string().description('Working directory for newly created DSH sessions'),
  provider: Schema.string().description('Optional DSH model provider override'),
  model: Schema.string().description('Optional DSH model override'),
})

interface TurnBuffer {
  target: SatoriTarget
  text?: string
}

export function apply(ctx: Context, config: Config): void {
  const client = new SatoriClient({
    baseUrl: config.baseUrl,
    token: config.token,
  })

  const agentOptions = config.provider || config.model
    ? {
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.model ? { model: config.model } : {}),
      }
    : undefined

  const router = new SessionRouter(ctx, {
    prefix: config.sessionPrefix,
    cwd: config.cwd ?? process.cwd(),
    agentOptions,
  })

  const targetBySession = new Map<SessionId, SatoriTarget>()
  const turns = new Map<string, TurnBuffer>()

  const disposeEventHandler = client.onEvent(async (event) => {
    const inbound = inboundMessage(event)
    if (!inbound) return

    const agent = await router.get(inbound.target)
    targetBySession.set(agent.id, inbound.target)
    agent.followup(createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: inbound.text }],
    }))
  })

  ctx.on('session/event', (session, event) => {
    if (event.type === 'assistant/message') {
      const text = assistantText(event.data.message)
      if (!text) return
      const target = targetBySession.get(session.id)
      if (!target) return
      turns.set(turnKey(session.id, event.data.turn), { target, text })
      return
    }

    if (event.type !== 'turn/end') return

    const key = turnKey(session.id, event.data.turn)
    const buffered = turns.get(key)
    turns.delete(key)
    if (!buffered?.text) return

    client.sendMessage(buffered.target, buffered.text).catch((error) => {
      console.error('[dsh-satori] failed to send assistant reply', error)
    })
  })

  ctx.effect(() => {
    client.start()
    return async () => {
      disposeEventHandler()
      client.stop()
      turns.clear()
      targetBySession.clear()
      await router.dispose()
    }
  })
}

function inboundMessage(event: SatoriEvent): { target: SatoriTarget; text: string } | undefined {
  if (event.type !== 'message-created') return

  const channelId = event.channel?.id ?? event.message?.channel?.id
  const selfId = event.selfId
  const platform = event.platform
  const userId = event.user?.id ?? event.message?.user?.id
  const selfUserId = event.login.user?.id
  const text = event.message?.content?.trim()

  if (!channelId || !selfId || !platform || !text) return
  if (selfUserId && userId === selfUserId) return

  return {
    target: { platform, selfId, channelId },
    text,
  }
}

function turnKey(sessionId: SessionId, turn: number): string {
  return `${sessionId}:${turn}`
}

export { SatoriClient } from './satori-client.js'
export { SessionRouter, sessionIdFor } from './session-router.js'
