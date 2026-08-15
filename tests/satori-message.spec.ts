import { describe, expect, it } from 'vitest'
import { plainTextFromSatori, satoriPlainText, satoriReplyText } from '../src/satori-message.js'

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

describe('Satori reply serialization', () => {
  it('serializes assistant output as text instead of executable Satori markup', () => {
    expect(satoriPlainText('hello <at id="42"/> & <img src="x"/>'))
      .toBe('hello &lt;at id="42"/&gt; &amp; &lt;img src="x"/&gt;')
  })

  it('prepends a standard quote element while keeping assistant output escaped', () => {
    expect(satoriReplyText('hello <at id="42"/>', 'source-1'))
      .toBe('<quote id="source-1"/>hello &lt;at id="42"/&gt;')
  })
})
