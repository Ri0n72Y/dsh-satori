import type { AssistantMessage } from '@deepseek-ai/dsh-llm'

export function assistantText(message: AssistantMessage): string {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
}
