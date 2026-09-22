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
    delete process.env.GROQ_API_KEYS
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

describe('Groq key pool', () => {
  beforeEach(() => {
    delete process.env.GROQ_API_KEY
    process.env.GROQ_API_KEYS = 'key-a,key-b,key-c'
  })

  it('falls back to the next key when one is rate-limited', async () => {
    const usedKeys: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const key = (init.headers as Record<string, string>).Authorization.replace('Bearer ', '')
        usedKeys.push(key)
        if (key !== 'key-c') {
          return Promise.resolve({ ok: false, status: 429, text: async () => 'quota exceeded' })
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'rewritten via key-c' } }] }),
        })
      }),
    )

    const { generateImprovement } = await import('../src/services/ai/provider.js')
    const result = await generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' })

    expect(result).toBe('rewritten via key-c')
    // Every key that was tried before success got a turn; none were skipped.
    expect(new Set(usedKeys).size).toBe(usedKeys.length)
  })

  it('throws QuotaExhaustedError only once every key in the pool is rate-limited', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'quota exceeded' }),
    )

    const { generateImprovement } = await import('../src/services/ai/provider.js')
    const { QuotaExhaustedError } = await import('../src/services/ai/errors.js')
    await expect(
      generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' }),
    ).rejects.toBeInstanceOf(QuotaExhaustedError)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not try other keys for a non-key-specific failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'upstream down' }),
    )

    const { generateImprovement } = await import('../src/services/ai/provider.js')
    await expect(
      generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' }),
    ).rejects.toThrow('Groq API error 500')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
