import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/services/ai/provider.js', () => ({
  generateImprovement: vi.fn(),
}))

import { app } from '../src/index.js'
import { generateImprovement } from '../src/services/ai/provider.js'

const mockedGenerate = vi.mocked(generateImprovement)

function post(body: unknown, origin = 'chrome-extension://test-ext-id') {
  return app.request('/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
}

describe('POST /api/improve', () => {
  beforeEach(() => {
    mockedGenerate.mockReset()
    process.env.ALLOWED_ORIGIN = 'chrome-extension://test-ext-id'
  })

  it('returns the improved text on success', async () => {
    mockedGenerate.mockResolvedValue('Dear Sir, I would like to request an extension.')

    const res = await post({ text: 'hey can you extend the deadline', style: 'formal' })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.outputText).toBe('Dear Sir, I would like to request an extension.')
    expect(body.style).toBe('formal')
    expect(typeof body.requestId).toBe('string')
  })

  it('rejects text longer than 2000 characters', async () => {
    const longText = 'a'.repeat(2001)
    const res = await post({ text: longText, style: 'formal' })
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toContain('too long')
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('rejects an unknown style', async () => {
    const res = await post({ text: 'hello', style: 'not-a-style' })
    expect(res.status).toBe(400)
  })

  it('rejects empty text', async () => {
    const res = await post({ text: '', style: 'formal' })
    expect(res.status).toBe(400)
  })

  it('returns a generic error when the AI call fails', async () => {
    mockedGenerate.mockRejectedValue(new Error('upstream boom'))

    const res = await post({ text: 'hello', style: 'formal' })
    expect(res.status).toBe(502)

    const body = await res.json()
    expect(body.error).toBe('Something went wrong. Try again.')
  })
})
