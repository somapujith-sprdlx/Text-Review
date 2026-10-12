import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/services/ai/prompts.js'
import { DEFAULT_PROFILE, type WritingProfile } from '../../shared/profile.js'

const PROFILE: WritingProfile = {
  tone: 'casual-professional',
  verbosity: 'short',
  emojiUsage: 'none',
  customInstructions: 'Sign off with "Cheers".',
  writingSamples: [],
}

describe('buildPrompt with a writing profile', () => {
  it('adds the WRITER\'S PREFERENCES block for a non-default profile', () => {
    const { system } = buildPrompt('formal', 'hello there', undefined, PROFILE)

    expect(system).toContain("WRITER'S PREFERENCES")
    expect(system).toContain('- Tone: casual but still professional.')
    expect(system).toContain('- Length: keep it short and to the point.')
    expect(system).toContain('- Emojis: never use emojis.')
    expect(system).toContain('- Also: Sign off with "Cheers".')
  })

  it('only lists the preferences that are set', () => {
    const { system } = buildPrompt('formal', 'hello', undefined, { ...DEFAULT_PROFILE, emojiUsage: 'rare' })
    expect(system).toContain('- Emojis: use emojis rarely.')
    expect(system).not.toContain('Tone:')
    expect(system).not.toContain('Length:')
  })

  it('does not add the block for a default profile', () => {
    const { system } = buildPrompt('formal', 'hello', undefined, DEFAULT_PROFILE)
    expect(system).not.toContain("WRITER'S PREFERENCES")
  })

  it('does not add the block when no profile is given, and leaves the prompt unchanged', () => {
    const without = buildPrompt('formal', 'hello')
    expect(without.system).not.toContain("WRITER'S PREFERENCES")
    expect(buildPrompt('formal', 'hello', undefined, DEFAULT_PROFILE)).toEqual(without)
  })

  it('never adds the block to grammar-fix, even with a non-default profile', () => {
    const { system } = buildPrompt('grammar-fix', 'hello', undefined, PROFILE)
    expect(system).not.toContain("WRITER'S PREFERENCES")
    expect(system).not.toContain('Sign off with')
  })

  it('keeps the custom instruction block alongside the preferences', () => {
    const { system } = buildPrompt('custom', 'hello', 'Make it punchy', PROFILE)
    expect(system).toContain('CUSTOM INSTRUCTION:\nMake it punchy')
    expect(system).toContain("WRITER'S PREFERENCES")
    expect(system.indexOf('CUSTOM INSTRUCTION')).toBeLessThan(system.indexOf("WRITER'S PREFERENCES"))
  })
})
