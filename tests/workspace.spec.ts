import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveWorkspace } from '../src/workspace.js'

describe('resolveWorkspace', () => {
  it('keeps omitted or blank cwd unset', () => {
    expect(resolveWorkspace()).toBeUndefined()
    expect(resolveWorkspace('   ')).toBeUndefined()
  })

  it('trims and resolves a configured cwd to an absolute path', () => {
    expect(resolveWorkspace(' ./safe-workspace ')).toBe(resolve('./safe-workspace'))
  })
})
