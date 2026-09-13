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
    process.env.GEMINI_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: 'Dear Sir, I would like to request an extension.' }] } },
          ],
        }),
      }),
    )
  })

  it('returns the rewritten text from the Gemini response', async () => {
    const { generateImprovement } = await import('../src/services/ai/provider.js')
    const result = await generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' })
    expect(result).toBe('Dear Sir, I would like to request an extension.')
  })
})
