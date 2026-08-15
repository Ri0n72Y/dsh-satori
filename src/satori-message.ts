import Element from '@satorijs/element'

interface ElementLike {
  type: string
  attrs?: Record<string, unknown>
  children?: ElementLike[]
}

export function plainTextFromSatori(content: string): string {
  let elements: ElementLike[]
  try {
    elements = Element.parse(content) as ElementLike[]
  } catch {
    return ''
  }

  const parts: string[] = []
  for (const element of elements) appendText(element, parts)
  return parts.join('').trim()
}

export function satoriPlainText(content: string): string {
  return Element('text', { content }).toString()
}

export function satoriReplyText(content: string, replyToMessageId?: string): string {
  const text = satoriPlainText(content)
  if (!replyToMessageId) return text
  return `${Element('quote', { id: replyToMessageId }).toString()}${text}`
}

function appendText(element: ElementLike, parts: string[]): void {
  if (element.type === 'text') {
    const content = element.attrs?.content
    if (typeof content === 'string') parts.push(content)
    return
  }
  if (element.type === 'quote') return
  if (element.type === 'br') {
    parts.push('\n')
    return
  }

  for (const child of element.children ?? []) appendText(child, parts)
  if (element.type === 'p' && parts.length > 0 && !parts.at(-1)?.endsWith('\n')) {
    parts.push('\n')
  }
}
