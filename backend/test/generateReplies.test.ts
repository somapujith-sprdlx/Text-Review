import { describe, it, expect, vi, beforeEach } from 'vitest'

// Groq call mocked at the provider boundary; the real error classes are used
// so the 429 -> QuotaExhaustedError mapping is exercised.
const callGroq = vi.fn()
vi.mock('../src/services/ai/providers/groq.js', () => ({
  callGroq: (system: string, user: string) => callGroq(system, user),
}))

import { generateReplies } from '../src/services/ai/provider.js'
import { ProviderHttpError, QuotaExhaustedError } from '../src/services/ai/errors.js'
import { DEFAULT_PROFILE } from '../../shared/profile.js'

const JSON_REPLY = JSON.stringify({
  replies: [
    { label: 'Agree', text: 'yesss lets do it' },
    { label: 'Ask', text: 'wait when tho?' },
    { label: 'Decline', text: 'cant rn sorry' },
  ],
})

describe('generateReplies', () => {
  beforeEach(() => {
    callGroq.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('parses valid JSON from the model', async () => {
    callGroq.mockResolvedValue(JSON_REPLY)

    const replies = await generateReplies({ text: 'dinner tonight?' })

    expect(replies).toEqual([
      { label: 'Agree', text: 'yesss lets do it' },
      { label: 'Ask', text: 'wait when tho?' },
      { label: 'Decline', text: 'cant rn sorry' },
    ])
    const [system, user] = callGroq.mock.calls[0]
    expect(user).toContain('dinner tonight?')
    expect(system).toContain('{"replies"')
  })

  it('parses JSON wrapped in markdown fences', async () => {
    callGroq.mockResolvedValue('```json\n' + JSON_REPLY + '\n```')
    const replies = await generateReplies({ text: 'hi' })
    expect(replies).toHaveLength(3)
    expect(replies[0].text).toBe('yesss lets do it')
  })

  it('falls back to a single option when the model answers in plain text', async () => {
    callGroq.mockResolvedValue('sure, sounds good to me')
    expect(await generateReplies({ text: 'hi' })).toEqual([{ label: 'Reply', text: 'sure, sounds good to me' }])
  })

  it('throws when parsing yields no options', async () => {
    callGroq.mockResolvedValue('   ')
    await expect(generateReplies({ text: 'hi' })).rejects.toThrow('no usable replies')
  })

  it('includes writing samples in the system prompt only when the profile has them', async () => {
    callGroq.mockResolvedValue(JSON_REPLY)

    await generateReplies({
      text: 'hi',
      profile: { ...DEFAULT_PROFILE, writingSamples: ['heyyy whats up', 'k sounds gud'] },
    })
    await generateReplies({ text: 'hi', profile: DEFAULT_PROFILE })
    await generateReplies({ text: 'hi' })

    expect(callGroq.mock.calls[0][0]).toContain('- heyyy whats up')
    expect(callGroq.mock.calls[0][0]).toContain('- k sounds gud')
    expect(callGroq.mock.calls[1][0]).not.toContain('HOW THE WRITER ACTUALLY TEXTS')
    expect(callGroq.mock.calls[2][0]).not.toContain('HOW THE WRITER ACTUALLY TEXTS')
  })

  it('maps a Groq 429 to QuotaExhaustedError, like generateImprovement', async () => {
    callGroq.mockRejectedValue(new ProviderHttpError('Groq', 429, 'quota exceeded'))
    await expect(generateReplies({ text: 'hi' })).rejects.toBeInstanceOf(QuotaExhaustedError)
  })

  it('rethrows other provider failures unchanged', async () => {
    callGroq.mockRejectedValue(new ProviderHttpError('Groq', 500, 'upstream down'))
    const err = await generateReplies({ text: 'hi' }).catch((e) => e)
    expect(err).toBeInstanceOf(ProviderHttpError)
    expect(err).not.toBeInstanceOf(QuotaExhaustedError)
    expect(err.message).toContain('Groq API error 500')
  })
})
