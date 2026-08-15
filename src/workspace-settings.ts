import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-workspace'
import Schema from '@deepseek-ai/schemastery'
import { resolveWorkspace, type WorkspaceResolver } from './workspace.js'

const SETTINGS_NAMESPACE = settingsNamespace('dsh-satori')
const CONFIG_ROUTE = '/plugins/dsh-satori/config'
const MAX_BODY_BYTES = 8 * 1024

interface WorkspaceSettings {
  workspacePath: string
}

const WorkspaceSettingsSchema: Schema<WorkspaceSettings> = Schema.object({
  workspacePath: Schema.string()
    .description('Directory used by Satori sessions')
    .default(''),
})

export function installWorkspaceConfiguration(
  ctx: Context,
  basePath: string | undefined,
  resolver: WorkspaceResolver,
): void {
  const base = resolveWorkspace(basePath) ?? ''
  ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(
      SETTINGS_NAMESPACE,
      WorkspaceSettingsSchema,
      { base: { workspacePath: base }, applies: 'live' },
    )

    resolver.setConfiguredPath(scope.get().workspacePath)
    settingsCtx.effect(() => {
      const stopWatching = scope.watch((next) => {
        resolver.setConfiguredPath(next.workspacePath)
      })
      return () => {
        stopWatching()
        resolver.setConfiguredPath(base)
      }
    }, 'dsh-satori.workspaceSettings')

    settingsCtx.inject(['webServer', 'workspaceRegistry'], (webCtx) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: CONFIG_ROUTE,
        handler: async (req, res) => {
          if (req.method === 'GET') {
            writeJson(res, 200, { workspacePath: scope.get().workspacePath })
            return
          }
          if (req.method !== 'PUT') {
            writeJson(res, 405, { error: 'method not allowed' })
            return
          }

          try {
            const body = await readJsonObject(req)
            if (typeof body.workspacePath !== 'string') {
              throw new TypeError('workspacePath must be a string')
            }
            const requested = resolveWorkspace(body.workspacePath)
            if (requested === undefined) {
              await scope.update({ workspacePath: '' })
              writeJson(res, 200, { workspacePath: '', workspaceId: null, reused: false })
              return
            }

            const existing = await webCtx.workspaceRegistry.resolveByPath(requested)
            const workspace = existing ?? await webCtx.workspaceRegistry.create(requested)
            await scope.update({ workspacePath: workspace.path })
            writeJson(res, 200, {
              workspacePath: workspace.path,
              workspaceId: String(workspace.id),
              reused: existing !== undefined,
            })
          } catch (error) {
            writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
          }
        },
      }), 'dsh-satori.workspaceConfigRoute')
    })
  })
}

async function readJsonObject(req: AsyncIterable<unknown>): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  const value: unknown = JSON.parse(text || '{}')
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

function writeJson(
  res: { writeHead(status: number, headers?: Record<string, string>): unknown; end(body?: string): unknown },
  status: number,
  value: unknown,
): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}
