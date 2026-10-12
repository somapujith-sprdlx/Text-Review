import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/services/ai/provider.js', () => ({
  generateImprovement: vi.fn(),
  generateReplies: vi.fn(),
}))
vi.mock('../src/services/google.js', () => ({
  verifyGoogleAccessToken: vi.fn(),
}))

import { app } from '../src/index.js'
import { generateReplies } from '../src/services/ai/provider.js'
import { QuotaExhaustedError } from '../src/services/ai/errors.js'
import { verifyGoogleAccessToken } from '../src/services/google.js'
import { MAX_REPLY_SOURCE_LENGTH } from '../../shared/reply.js'

const mockedGenerate = vi.mocked(generateReplies)
const mockedVerify = vi.mocked(verifyGoogleAccessToken)

const DEVICE_HEADERS = { 'X-Device-Id': 'device-reply-test' }
const GOOGLE_HEADERS = { ...DEVICE_HEADERS, Authorization: 'Bearer good-token' }

const REPLIES = [
  { label: 'Sounds good', text: 'yesss sounds good!!' },
  { label: 'Ask details', text: 'wait what time tho' },
  { label: 'Decline', text: 'cant make it sorry' },
]

// Each request comes from its own IP so the route's 20/min burst limiter never
// interferes (its 429 has the same body as a quota-exhausted 429).
let requestCount = 0
function post(body: unknown, authHeaders: Record<string, string> = GOOGLE_HEADERS) {
  requestCount += 1
  return app.request('/api/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': `10.0.0.${requestCount}`,
      ...authHeaders,
      // Fresh device per request too, so the daily allowance never trips.
      ...(authHeaders['X-Device-Id'] ? { 'X-Device-Id': `${authHeaders['X-Device-Id']}-${requestCount}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/reply', () => {
  beforeEach(() => {
    mockedGenerate.mockReset()
    mockedVerify.mockReset()
    mockedVerify.mockResolvedValue({ sub: 'g-reply-test', email: 'a@example.com' })
  })

  it('returns 401 SIGN_IN_REQUIRED when only a device id is presented', async () => {
    const res = await post({ text: 'hello' }, DEVICE_HEADERS)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Please sign in with Google to use Lipi.', code: 'SIGN_IN_REQUIRED' })
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('returns 401 SIGN_IN_REQUIRED when the bearer token is rejected by Google', async () => {
    mockedVerify.mockResolvedValue(null)
    const res = await post({ text: 'hello' })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' })
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid JSON body', async () => {
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-object body', async () => {
    for (const body of ['null', '"hello"', '42']) {
      const res = await post(body)
      expect(res.status).toBe(400)
    }
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('returns 400 when text is missing, empty, blank or not a string', async () => {
    for (const body of [{}, { text: '' }, { text: '   \n ' }, { text: 123 }]) {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Text is required.' })
    }
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('returns 400 when the text is longer than the reply source limit', async () => {
    const res = await post({ text: 'a'.repeat(MAX_REPLY_SOURCE_LENGTH + 1) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('too long')
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('accepts text exactly at the limit', async () => {
    mockedGenerate.mockResolvedValue(REPLIES)
    const res = await post({ text: 'a'.repeat(MAX_REPLY_SOURCE_LENGTH) })
    expect(res.status).toBe(200)
  })

  it('returns the replies, a request id and usage on success', async () => {
    mockedGenerate.mockResolvedValue(REPLIES)

    const res = await post({ text: 'are you free tonight?' })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.replies).toEqual(REPLIES)
    expect(typeof body.requestId).toBe('string')
    expect(body.usage).toMatchObject({ limit: 20 })
    expect(typeof body.usage.used).toBe('number')
    expect(mockedGenerate).toHaveBeenCalledTimes(1)
    expect(mockedGenerate.mock.calls[0][0].text).toBe('are you free tonight?')
  })

  it('passes no profile when none is sent', async () => {
    mockedGenerate.mockResolvedValue(REPLIES)
    const res = await post({ text: 'hello' })
    expect(res.status).toBe(200)
    expect(mockedGenerate.mock.calls[0][0].profile).toBeUndefined()
  })

  it('passes a sanitized profile including writing samples', async () => {
    mockedGenerate.mockResolvedValue(REPLIES)
    const res = await post({
      text: 'hello',
      profile: {
        tone: 'casual',
        verbosity: 'short',
        emojiUsage: 'rare',
        customInstructions: '  keep\n\nit   brief ',
        writingSamples: ['  heyyy whats up\n', 'k sounds gud', '', 42, 'a'.repeat(500)],
      },
    })
    expect(res.status).toBe(200)

    const profile = mockedGenerate.mock.calls[0][0].profile
    expect(profile).toMatchObject({
      tone: 'casual',
      verbosity: 'short',
      emojiUsage: 'rare',
      customInstructions: 'keep it brief',
    })
    expect(profile?.writingSamples).toHaveLength(3)
    expect(profile?.writingSamples.slice(0, 2)).toEqual(['heyyy whats up', 'k sounds gud'])
    expect(profile?.writingSamples[2]).toHaveLength(240)
  })

  it('caps the number of writing samples at 8', async () => {
    mockedGenerate.mockResolvedValue(REPLIES)
    const samples = Array.from({ length: 20 }, (_, i) => `sample ${i}`)
    await post({ text: 'hello', profile: { writingSamples: samples } })
    expect(mockedGenerate.mock.calls[0][0].profile?.writingSamples).toEqual(samples.slice(0, 8))
  })

  it('turns a garbage profile into defaults instead of rejecting or forwarding it', async () => {
    mockedGenerate.mockResolvedValue(REPLIES)
    const defaults = {
      tone: 'default',
      verbosity: 'default',
      emojiUsage: 'default',
      customInstructions: '',
      writingSamples: [],
    }

    const res = await post({
      text: 'hello',
      profile: { tone: 'x', customInstructions: 123, writingSamples: 'nope', extra: 'ignored' },
    })
    expect(res.status).toBe(200)
    expect(mockedGenerate.mock.calls[0][0].profile).toEqual(defaults)

    mockedGenerate.mockClear()
    const res2 = await post({ text: 'hello', profile: 'not-an-object' })
    expect(res2.status).toBe(200)
    expect(mockedGenerate.mock.calls[0][0].profile).toEqual(defaults)
  })

  it('returns 502 with a generic message when generation fails', async () => {
    mockedGenerate.mockRejectedValue(new Error('upstream boom'))

    const res = await post({ text: 'hello' })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Something went wrong. Try again.' })
  })

  it('returns 502 when the model produced no usable replies', async () => {
    mockedGenerate.mockRejectedValue(new Error('Groq returned no usable replies'))

    const res = await post({ text: 'hello' })
    expect(res.status).toBe(502)
  })

  it('returns 429 with LIMIT_REACHED when the shared provider quota is exhausted', async () => {
    mockedGenerate.mockRejectedValue(new QuotaExhaustedError('Groq API error 429: quota'))

    const res = await post({ text: 'hello' })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: "You've reached your current usage limit.", code: 'LIMIT_REACHED' })
  })
})
