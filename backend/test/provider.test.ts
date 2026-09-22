import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPrompt } from '../src/services/ai/prompts.js'

describe('buildPrompt', () => {
  it('builds a formal-style prompt containing the rules and the text', () => {
    const { system, user } = buildPrompt('formal', 'hey can you extend the deadline')

    expect(system).toContain('formal')
    expect(system).toContain('Preserve the original meaning')
    expect(system).toContain('Do not invent facts')
    expect(user).toContain('hey can you extend the deadline')
  })

  it('includes the custom instruction for the custom style', () => {
    const { system } = buildPrompt('custom', 'some text', 'Make this sound like a LinkedIn post')
    expect(system).toContain('Make this sound like a LinkedIn post')
  })
})

describe('generateImprovement', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-groq-key'
  })

  it('returns the rewritten text from Groq', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Dear Sir, I would like to request an extension.' } }],
        }),
      }),
    )

    const { generateImprovement } = await import('../src/services/ai/provider.js')
    const result = await generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' })
    expect(result).toBe('Dear Sir, I would like to request an extension.')
  })

  it('rethrows the Groq error when the call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'upstream down',
      }),
    )

    const { generateImprovement } = await import('../src/services/ai/provider.js')
    await expect(
      generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' }),
    ).rejects.toThrow('Groq API error 500')
  })

  it('throws QuotaExhaustedError when Groq reports the quota is used up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'quota exceeded',
      }),
    )

    const { generateImprovement } = await import('../src/services/ai/provider.js')
    const { QuotaExhaustedError } = await import('../src/services/ai/errors.js')
    await expect(
      generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' }),
    ).rejects.toBeInstanceOf(QuotaExhaustedError)
  })
})
