import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-session-persistence'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import Schema from '@deepseek-ai/schemastery'
import { resolve } from 'node:path'

import { inboundMessage, type AdmissionPolicy } from './inbound.js'
import { assistantText } from './message.js'
import { ReplyTracker } from './reply-tracker.js'
import { SatoriClient } from './satori-client.js'
import { SessionRouter } from './session-router.js'

export const name = 'dsh-satori'
export const inject = ['agents', 'sessionPersistence']

export interface Config {
  baseUrl: string
  token?: string
  sessionPrefix: string
  cwd?: string
  provider?: string
  model?: string
  allowedUsers: string[]
  allowedChannels: string[]
  allowedLogins: string[]
  unsafeAllowAll: boolean
  maxLiveAgents: number
  idleTtlMs: number
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
  allowedUsers: Schema.array(String)
    .description('Allowed Satori users as <platform>:<userId>')
    .default([]),
  allowedChannels: Schema.array(String)
    .description('Allowed Satori channels as <platform>:<channelId>')
    .default([]),
  allowedLogins: Schema.array(String)
    .description('Optional Satori bot login filter as <platform>:<selfId>')
    .default([]),
  unsafeAllowAll: Schema.boolean()
    .description('Accept every non-bot Satori sender. Intended only for trusted test environments.')
    .default(false),
  maxLiveAgents: Schema.number()
    .description('Maximum number of live DSH agents owned by this plugin')
    .min(1)
    .step(1)
    .default(32),
  idleTtlMs: Schema.number()
    .description('Idle owned agents older than this are disposed when capacity is checked')
    .min(1000)
    .step(1)
    .default(900_000),
})

export function apply(ctx: Context, config: Config): void {
  const logger = ctx.logger
  const client = new SatoriClient({
    baseUrl: config.baseUrl,
    token: config.token,
    onError: error => logger.warn(`dsh-satori: ${String(error)}`),
  })

  const agentOptions = config.provider || config.model
    ? {
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.model ? { model: config.model } : {}),
      }
    : undefined

  const router = new SessionRouter(ctx, {
    prefix: config.sessionPrefix,
    cwd: resolve(config.cwd ?? process.cwd()),
    agentOptions,
    maxLiveAgents: config.maxLiveAgents,
    idleTtlMs: config.idleTtlMs,
  })
  const replies = new ReplyTracker()
  const admission: AdmissionPolicy = {
    allowedUsers: config.allowedUsers,
    allowedChannels: config.allowedChannels,
    allowedLogins: config.allowedLogins,
    unsafeAllowAll: config.unsafeAllowAll,
  }
  let closed = false

  const disposeEventHandler = client.onEvent(async (event) => {
    const inbound = inboundMessage(event, admission)
    if (!inbound) return

    const agent = await router.get(inbound.identity)
    if (closed) return

    const message = createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: inbound.text }],
    })
    replies.queue(agent, message.id, inbound.target)
    try {
      agent.followup(message)
    } catch (error) {
      replies.discard(agent, message.id)
      throw error
    }
  })

  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    replies.claim(agent, message.id, turn)
  })

  ctx.on('agent/inbox/discarded', ({ agent, message }) => {
    replies.discard(agent, message.id)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    replies.dropAgent(agent)
  })

  ctx.on('session/event', (session, event) => {
    if (event.type === 'assistant/message') {
      const text = assistantText(event.data.message)
      if (text) replies.assistant(session.id, event.data.turn, text)
      return
    }

    if (event.type !== 'turn/end') return
    const reply = replies.end(session.id, event.data.turn)
    if (!reply) return

    void client.sendMessage(reply.target, reply.text).catch((error) => {
      logger.warn(`dsh-satori: failed to send assistant reply: ${String(error)}`)
    })
  })

  ctx.effect(() => {
    client.start()
    return async () => {
      closed = true
      disposeEventHandler()
      await client.stop()
      replies.clear()
      await router.dispose()
    }
  })
}

export { inboundMessage, peerKey } from './inbound.js'
export { ReplyTracker } from './reply-tracker.js'
export { SatoriClient } from './satori-client.js'
export { SessionRouter, sessionIdFor } from './session-router.js'
