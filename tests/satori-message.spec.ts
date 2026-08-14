import { describe, expect, it } from 'vitest'
import { plainTextFromSatori } from '../src/satori-message.js'

describe('plainTextFromSatori', () => {
  it('uses the Satori element parser and keeps only visible text nodes', () => {
    expect(plainTextFromSatori('hello <at id="42"/>world<img src="https://example.test/a.png"/>'))
      .toBe('hello world')
  })

  it('keeps nested text and line breaks while excluding quote content', () => {
    expect(plainTextFromSatori('<quote id="1">old text</quote><p>new <b>text</b><br/>line</p>'))
      .toBe('new text\nline')
  })

  it('returns empty text for a non-text-only message', () => {
    expect(plainTextFromSatori('<img src="https://example.test/a.png"/>')).toBe('')
  })
})
