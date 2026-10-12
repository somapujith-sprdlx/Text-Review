import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/services/ai/provider.js', () => ({
  generateImprovement: vi.fn(),
}))
vi.mock('../src/services/google.js', () => ({
  verifyGoogleAccessToken: vi.fn(),
}))

import { app } from '../src/index.js'
import { generateImprovement } from '../src/services/ai/provider.js'
import { QuotaExhaustedError } from '../src/services/ai/errors.js'
import { verifyGoogleAccessToken } from '../src/services/google.js'

const mockedGenerate = vi.mocked(generateImprovement)
const mockedVerify = vi.mocked(verifyGoogleAccessToken)

const DEVICE_HEADERS = { 'X-Device-Id': 'device-improve-test' }
const GOOGLE_HEADERS = { ...DEVICE_HEADERS, Authorization: 'Bearer good-token' }

// Sign-in is compulsory, so by default a request presents a verified Google
// identity as well as the device id; pass different headers to test the
// signed-out paths.
function post(body: unknown, origin = 'chrome-extension://test-ext-id', authHeaders: Record<string, string> = GOOGLE_HEADERS) {
  return app.request('/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...authHeaders },
    body: JSON.stringify(body),
  })
}

describe('POST /api/improve', () => {
  beforeEach(() => {
    mockedGenerate.mockReset()
    mockedVerify.mockReset()
    mockedVerify.mockResolvedValue({ sub: 'g-improve-test', email: 'a@example.com' })
    process.env.ALLOWED_ORIGIN = 'chrome-extension://test-ext-id'
  })

  it('returns 401 SIGN_IN_REQUIRED when only a device id is presented', async () => {
    const res = await post({ text: 'hello', style: 'formal' }, undefined, DEVICE_HEADERS)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Please sign in with Google to use Lipi.', code: 'SIGN_IN_REQUIRED' })
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('returns 401 SIGN_IN_REQUIRED when the bearer token is rejected by Google', async () => {
    mockedVerify.mockResolvedValue(null)
    const res = await post({ text: 'hello', style: 'formal' })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' })
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('returns 401 SIGN_IN_REQUIRED when no identity is presented at all', async () => {
    const res = await post({ text: 'hello', style: 'formal' }, undefined, {})
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' })
  })

  it('returns the improved text on success', async () => {
    mockedGenerate.mockResolvedValue('Dear Sir, I would like to request an extension.')

    const res = await post({ text: 'hey can you extend the deadline', style: 'formal' })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.outputText).toBe('Dear Sir, I would like to request an extension.')
    expect(body.style).toBe('formal')
    expect(typeof body.requestId).toBe('string')
    expect(body.usage).toMatchObject({ limit: 20 })
    expect(typeof body.usage.used).toBe('number')
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

  it('passes no profile to generateImprovement when none is sent', async () => {
    mockedGenerate.mockResolvedValue('ok')
    const res = await post({ text: 'hello', style: 'formal' })
    expect(res.status).toBe(200)
    expect(mockedGenerate.mock.calls[0][0].profile).toBeUndefined()
  })

  it('passes a sanitized profile to generateImprovement', async () => {
    mockedGenerate.mockResolvedValue('ok')
    const res = await post({
      text: 'hello',
      style: 'formal',
      profile: { tone: 'friendly', verbosity: 'short', emojiUsage: 'none', customInstructions: '  keep\n\nit   brief ' },
    })
    expect(res.status).toBe(200)
    expect(mockedGenerate.mock.calls[0][0].profile).toEqual({
      tone: 'friendly',
      verbosity: 'short',
      emojiUsage: 'none',
      customInstructions: 'keep it brief',
      writingSamples: [],
    })
  })

  it('turns a garbage profile into defaults instead of rejecting or forwarding it', async () => {
    mockedGenerate.mockResolvedValue('ok')
    const res = await post({
      text: 'hello',
      style: 'formal',
      profile: { tone: 'x', customInstructions: 123, extra: 'ignored' },
    })
    expect(res.status).toBe(200)
    expect(mockedGenerate.mock.calls[0][0].profile).toEqual({
      tone: 'default',
      verbosity: 'default',
      emojiUsage: 'default',
      customInstructions: '',
      writingSamples: [],
    })

    mockedGenerate.mockClear()
    const res2 = await post({ text: 'hello', style: 'formal', profile: 'not-an-object' })
    expect(res2.status).toBe(200)
    expect(mockedGenerate.mock.calls[0][0].profile).toEqual({
      tone: 'default',
      verbosity: 'default',
      emojiUsage: 'default',
      customInstructions: '',
      writingSamples: [],
    })
  })

  it('caps overlong custom instructions in the forwarded profile', async () => {
    mockedGenerate.mockResolvedValue('ok')
    await post({ text: 'hello', style: 'formal', profile: { customInstructions: 'a'.repeat(5000) } })
    expect(mockedGenerate.mock.calls[0][0].profile?.customInstructions).toHaveLength(500)
  })

  it('returns a generic error when the AI call fails', async () => {
    mockedGenerate.mockRejectedValue(new Error('upstream boom'))

    const res = await post({ text: 'hello', style: 'formal' })
    expect(res.status).toBe(502)

    const body = await res.json()
    expect(body.error).toBe('Something went wrong. Try again.')
  })

  it('returns 429 with LIMIT_REACHED when the shared provider quota is exhausted', async () => {
    mockedGenerate.mockRejectedValue(new QuotaExhaustedError('All AI providers failed � groq: 429'))

    const res = await post({ text: 'hello', style: 'formal' })
    expect(res.status).toBe(429)

    const body = await res.json()
    expect(body.code).toBe('LIMIT_REACHED')
  })
})
