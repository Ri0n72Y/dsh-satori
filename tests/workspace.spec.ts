import { describe, expect, it, vi } from 'vitest'
import { resolveWorkspace, WorkspaceResolver } from '../src/workspace.js'

it('keeps workspace unset when cwd is missing or blank', () => {
  expect(resolveWorkspace()).toBeUndefined()
  expect(resolveWorkspace('   ')).toBeUndefined()
})

it('trims and resolves an explicitly configured workspace', () => {
  expect(resolveWorkspace('  ./workspace  ')).toMatch(/workspace$/)
})

describe('WorkspaceResolver', () => {
  it('reuses an existing DSH workspace for the same canonical directory', async () => {
    const path = resolveWorkspace('/repo') as string
    const workspace = { path, attachSession: vi.fn(async () => undefined) }
    const registry = {
      resolveByPath: vi.fn(async () => workspace),
      create: vi.fn(async () => workspace),
    }
    const ctx = { get: (name: string) => name === 'workspaceRegistry' ? registry : undefined }
    const resolver = new WorkspaceResolver(ctx as never, '/repo')

    await expect(resolver.current()).resolves.toMatchObject({ path })
    expect(registry.resolveByPath).toHaveBeenCalledWith(path)
    expect(registry.create).not.toHaveBeenCalled()
  })

  it('registers the directory as a workspace when no workspace owns it', async () => {
    const path = resolveWorkspace('/repo') as string
    const workspace = { path, attachSession: vi.fn(async () => undefined) }
    const registry = {
      resolveByPath: vi.fn(async () => undefined),
      create: vi.fn(async () => workspace),
    }
    const ctx = { get: (name: string) => name === 'workspaceRegistry' ? registry : undefined }
    const resolver = new WorkspaceResolver(ctx as never, '/repo')

    await expect(resolver.current()).resolves.toMatchObject({ path })
    expect(registry.create).toHaveBeenCalledWith(path)
  })
})
