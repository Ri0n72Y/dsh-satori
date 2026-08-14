import { resolve } from 'node:path'

export function resolveWorkspace(cwd?: string): string | undefined {
  const value = cwd?.trim()
  return value ? resolve(value) : undefined
}
