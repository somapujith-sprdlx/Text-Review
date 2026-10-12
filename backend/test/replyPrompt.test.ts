import { describe, it, expect } from 'vitest'
import { buildReplyPrompt, parseReplyOptions, REPLY_OPTION_COUNT } from '../../shared/reply.js'
import { DEFAULT_PROFILE } from '../../shared/profile.js'

describe('buildReplyPrompt', () => {
  it('puts the received message in the user prompt', () => {
    const { user } = buildReplyPrompt('are you coming tonight?')
    expect(user).toContain('are you coming tonight?')
  })

  it('asks for JSON with the expected shape', () => {
    const { system } = buildReplyPrompt('hi')
    expect(system).toContain(`${REPLY_OPTION_COUNT} different replies`)
    expect(system).toContain('{"replies":[{"label":"...","text":"..."}]}')
  })

  it('adds the style block with samples only when samples are provided', () => {
    const withSamples = buildReplyPrompt('hi', { ...DEFAULT_PROFILE, writingSamples: ['heyyy wassup', 'lol ya k'] })
    expect(withSamples.system).toContain('HOW THE WRITER ACTUALLY TEXTS')
    expect(withSamples.system).toContain('- heyyy wassup')
    expect(withSamples.system).toContain('- lol ya k')

    expect(buildReplyPrompt('hi', DEFAULT_PROFILE).system).not.toContain('HOW THE WRITER ACTUALLY TEXTS')
    expect(buildReplyPrompt('hi').system).not.toContain('HOW THE WRITER ACTUALLY TEXTS')
  })

  it('includes non-default preferences and omits the block for a default profile', () => {
    const prefs = buildReplyPrompt('hi', { ...DEFAULT_PROFILE, tone: 'casual', emojiUsage: 'none' })
    expect(prefs.system).toContain("WRITER'S PREFERENCES")
    expect(prefs.system).toContain('Emojis: never use emojis.')

    expect(buildReplyPrompt('hi', DEFAULT_PROFILE).system).not.toContain("WRITER'S PREFERENCES")
  })
})

describe('parseReplyOptions', () => {
  it('parses plain JSON', () => {
    expect(parseReplyOptions('{"replies":[{"label":"Yes","text":"sure"}]}')).toEqual([{ label: 'Yes', text: 'sure' }])
  })

  it('strips json fences and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n{"replies":[{"label":"Yes","text":"sure"}]}\n```\nHope that helps'
    expect(parseReplyOptions(raw)).toEqual([{ label: 'Yes', text: 'sure' }])
  })

  it('keeps at most three options', () => {
    const replies = Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, text: `t${i}` }))
    const options = parseReplyOptions(JSON.stringify({ replies }))
    expect(options).toHaveLength(3)
    expect(options.map((o) => o.text)).toEqual(['t0', 't1', 't2'])
  })

  it('defaults a missing label and drops entries without text', () => {
    const raw = JSON.stringify({
      replies: [{ text: 'ok' }, { label: 'Empty', text: '  ' }, 'junk', null, { label: 'X', text: 7 }],
    })
    expect(parseReplyOptions(raw)).toEqual([{ label: 'Reply', text: 'ok' }])
  })

  it('falls back to a single option for plain text', () => {
    expect(parseReplyOptions('  sounds good!  ')).toEqual([{ label: 'Reply', text: 'sounds good!' }])
  })

  it('falls back to a single option for malformed JSON', () => {
    const options = parseReplyOptions('{"replies":[{"label":"Yes","text":"sure"')
    expect(options).toHaveLength(1)
    expect(options[0].label).toBe('Reply')
  })

  it('returns no options for empty output', () => {
    expect(parseReplyOptions('')).toEqual([])
    expect(parseReplyOptions('```json\n```')).toEqual([])
  })
})
