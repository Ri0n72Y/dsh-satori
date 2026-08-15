import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-session-persistence'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import Schema from '@deepseek-ai/schemastery'

import { compileAdmissionPolicy, inboundMessage } from './inbound.js'
import { assistantText } from './message.js'
import { ReplyTracker } from './reply-tracker.js'
import { SatoriClient } from './satori-client.js'
import { SessionRouter } from './session-router.js'
import { WorkspaceResolver } from './workspace.js'
import { installWorkspaceConfiguration } from './workspace-settings.js'

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
  cwd: Schema.string().description('Deployment default workspace directory for Satori sessions'),
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
  let closed = false
  const client = new SatoriClient({
    baseUrl: config.baseUrl,
    token: config.token,
    onError: error => {
      if (!closed) logger.warn(`dsh-satori: ${String(error)}`)
    },
  })

  const agentOptions = config.provider || config.model
    ? {
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.model ? { model: config.model } : {}),
      }
    : undefined

  const workspaceResolver = new WorkspaceResolver(ctx, config.cwd)
  installWorkspaceConfiguration(ctx, config.cwd, workspaceResolver)

  const router = new SessionRouter(ctx, {
    prefix: config.sessionPrefix,
    agentOptions,
    maxLiveAgents: config.maxLiveAgents,
    idleTtlMs: config.idleTtlMs,
  })
  const replies = new ReplyTracker()
  const admission = compileAdmissionPolicy({
    allowedUsers: config.allowedUsers,
    allowedChannels: config.allowedChannels,
    allowedLogins: config.allowedLogins,
    unsafeAllowAll: config.unsafeAllowAll,
  })

  const disposeEventHandler = client.onEvent(async (event) => {
    if (closed) return
    const inbound = inboundMessage(event, admission)
    if (!inbound) return
    const workspace = await workspaceResolver.current()

    await router.withAgent(inbound.identity, (agent) => {
      if (closed) return
      if (ctx.agents.get(agent.id) !== agent) {
        throw new Error(`dsh-satori agent ${agent.id} was disposed before followup`)
      }

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
    }, workspace)
  })

  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    if (closed) return
    replies.claim(agent, message.id, turn)
  })

  ctx.on('agent/inbox/discarded', ({ agent, message }) => {
    if (closed) return
    replies.discard(agent, message.id)
  })

  ctx.on('agent/error', ({ agent, turn, error }) => {
    if (closed) return
    replies.failTurn(agent, turn)
    const present = new Set([
      ...agent.inbox.nextTurn.map(message => message.id),
      ...agent.inbox.nextStep.map(message => message.id),
    ])
    replies.discardAbsentPending(agent, present)
    if (router.owns(agent)) logger.warn(`dsh-satori: agent ${agent.id} turn ${turn} failed: ${String(error)}`)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    replies.dropAgent(agent)
  })

  ctx.on('session/event', (session, event) => {
    if (closed) return
    if (event.type === 'assistant/message') {
      replies.assistant(session.id, event.data.turn, assistantText(event.data.message))
      return
    }

    if (event.type !== 'turn/end') return
    const reply = replies.end(session.id, event.data.turn, event.data.reason)
    if (!reply) return

    void client.sendMessage(reply.target, reply.text).catch((error) => {
      if (!closed) logger.warn(`dsh-satori: failed to send assistant reply: ${String(error)}`)
    })
  })

  ctx.effect(() => {
    client.start()
    return async () => {
      closed = true
      disposeEventHandler()
      replies.clear()
      const results = await Promise.allSettled([router.dispose(), client.stop()])
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason)
      if (failures.length > 0) {
        throw new AggregateError(failures, `dsh-satori shutdown failed in ${failures.length} component(s)`)
      }
    }
  })
}

export { compileAdmissionPolicy, inboundMessage, peerKey } from './inbound.js'
export { plainTextFromSatori, satoriReplyText } from './satori-message.js'
export { ReplyTracker } from './reply-tracker.js'
export { SatoriClient } from './satori-client.js'
export { SessionRouter, sessionIdFor } from './session-router.js'
export { WorkspaceResolver } from './workspace.js'
