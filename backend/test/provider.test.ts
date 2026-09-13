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

vi.mock('openai', () => {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Dear Sir, I would like to request an extension.' } }],
  })
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create } },
    })),
  }
})

describe('generateImprovement', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
  })

  it('returns the rewritten text from the OpenAI response', async () => {
    const { generateImprovement } = await import('../src/services/ai/provider.js')
    const result = await generateImprovement({ text: 'hey can you extend the deadline', style: 'formal' })
    expect(result).toBe('Dear Sir, I would like to request an extension.')
  })
})
