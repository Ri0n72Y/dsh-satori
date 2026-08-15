import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'

export interface SessionWorkspace {
  path: string
  attachSession(sessionId: SessionId): Promise<void>
}

export function resolveWorkspace(cwd?: string): string | undefined {
  const value = cwd?.trim()
  return value ? resolve(value) : undefined
}

export class WorkspaceResolver {
  private configuredPath?: string
  private cachedPath?: string
  private cached?: Promise<SessionWorkspace>

  constructor(
    private readonly ctx: Context,
    initialPath?: string,
  ) {
    this.setConfiguredPath(initialPath)
  }

  setConfiguredPath(path?: string): void {
    const next = resolveWorkspace(path)
    if (next === this.configuredPath) return
    this.configuredPath = next
    this.cachedPath = undefined
    this.cached = undefined
  }

  getConfiguredPath(): string | undefined {
    return this.configuredPath
  }

  async current(): Promise<SessionWorkspace | undefined> {
    const path = this.configuredPath
    if (path === undefined) return
    if (this.cachedPath === path && this.cached !== undefined) return this.cached

    const pending = this.resolvePath(path)
    this.cachedPath = path
    this.cached = pending
    try {
      return await pending
    } catch (error) {
      if (this.cachedPath === path && this.cached === pending) {
        this.cachedPath = undefined
        this.cached = undefined
      }
      throw error
    }
  }

  private async resolvePath(path: string): Promise<SessionWorkspace> {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry === undefined) {
      throw new Error('dsh-satori workspace directory requires the DSH workspaceRegistry service')
    }
    const existing = await registry.resolveByPath(path)
    const workspace = existing ?? await registry.create(path)
    return {
      path: workspace.path,
      attachSession: sessionId => workspace.attachSession(sessionId),
    }
  }
}
