import { createElement as h, useEffect, useState } from 'react'

const ENDPOINT = '/plugins/dsh-satori/config'

interface Snapshot {
  workspacePath: string
  workspaceId?: string | null
  reused?: boolean
}

interface SlotContext {
  slots: {
    inject(name: string, factory: () => unknown): void
    register(options: Record<string, unknown>, component: () => unknown): unknown
  }
}

export const inject = ['slots']

export function apply(ctx: SlotContext): void {
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'dsh-satori',
    order: 30,
  }, SatoriWorkspaceCard))
}

function SatoriWorkspaceCard() {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('Loading workspace setting...')

  useEffect(() => {
    let active = true
    void request('GET').then((snapshot) => {
      if (!active) return
      setValue(snapshot.workspacePath)
      setSaved(snapshot.workspacePath)
      setMessage('')
    }).catch((error) => {
      if (active) setMessage(String(error))
    }).finally(() => {
      if (active) setBusy(false)
    })
    return () => { active = false }
  }, [])

  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      const snapshot = await request('PUT', { workspacePath: value })
      setValue(snapshot.workspacePath)
      setSaved(snapshot.workspacePath)
      setMessage(snapshot.workspacePath === ''
        ? 'Workspace directory cleared.'
        : snapshot.reused
          ? 'Saved. Existing DSH workspace will be reused.'
          : 'Saved. The directory was registered as a DSH workspace.')
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  return h('li', {
    style: {
      listStyle: 'none',
      border: '1px solid currentColor',
      borderRadius: '8px',
      padding: '16px',
      opacity: busy ? 0.8 : 1,
    },
  },
  h('strong', null, 'dsh-satori'),
  h('p', null, 'Satori sessions use this directory. An existing DSH workspace is reused; otherwise the directory is registered as a workspace.'),
  h('label', { style: { display: 'block' } },
    h('span', null, 'Workspace directory'),
    h('input', {
      type: 'text',
      value,
      disabled: busy,
      placeholder: '/absolute/path/to/workspace',
      onChange: (event: { currentTarget: { value: string } }) => setValue(event.currentTarget.value),
      style: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '6px' },
    }),
  ),
  h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' } },
    h('button', {
      type: 'button',
      disabled: busy || value === saved,
      onClick: () => { void save() },
    }, busy ? 'Saving...' : 'Save'),
    message ? h('span', { role: 'status' }, message) : null,
  ))
}

async function request(method: 'GET' | 'PUT', body?: Record<string, unknown>): Promise<Snapshot> {
  const response = await fetch(ENDPOINT, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({})) as Partial<Snapshot> & { error?: unknown }
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`)
  if (typeof payload.workspacePath !== 'string') throw new Error('invalid dsh-satori configuration response')
  return payload as Snapshot
}
