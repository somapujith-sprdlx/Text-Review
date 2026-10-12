import { describe, it, expect } from 'vitest'
import { pickRepresentativeSamples, voiceScore } from '../../shared/styleLearner.js'

const BLAND = 'I will review the attached document and send my feedback by Friday.'
const QUIRKY = 'heyyy whats up bro lol'

describe('voiceScore', () => {
  it('rates texting quirks above plain formal prose', () => {
    expect(voiceScore(QUIRKY)).toBeGreaterThan(voiceScore(BLAND))
    expect(voiceScore('omw, see u soon 😂')).toBeGreaterThan(voiceScore(BLAND))
  })

  it('penalises messages too short to carry a voice and link-heavy ones', () => {
    expect(voiceScore('k')).toBeLessThan(voiceScore(QUIRKY))
    expect(voiceScore('check this out https://www.example.com/a/b')).toBeLessThan(voiceScore('check this out lol'))
  })

  it('does not treat "www" in a link as a stretched letter', () => {
    expect(voiceScore('https://www.example.com/page')).toBeLessThan(0)
  })
})

describe('pickRepresentativeSamples', () => {
  it('prefers quirky, personal messages over bland ones', () => {
    const picked = pickRepresentativeSamples(
      [BLAND, 'Thank you for your email regarding the quarterly report.', QUIRKY, 'gonna be late, ur call 😅'],
      2,
    )
    expect(picked).toHaveLength(2)
    expect(picked).toContain(QUIRKY)
    expect(picked).toContain('gonna be late, ur call 😅')
  })

  it('drops near-duplicates, keeping only one of a cluster', () => {
    const picked = pickRepresentativeSamples(
      ['heyyy whats up', 'Hey, whats up!', 'HEY whats up', 'running late, grab me a coffee pls'],
      4,
    )
    const heyCluster = picked.filter((s) => /whats up/i.test(s))
    expect(heyCluster).toHaveLength(1)
    expect(picked).toContain('running late, grab me a coffee pls')
  })

  it('respects the limit and never returns more candidates than exist', () => {
    const many = Array.from({ length: 20 }, (_, i) => `message number ${i} about topic ${String.fromCharCode(97 + i)}${i}`)
    expect(pickRepresentativeSamples(many, 5)).toHaveLength(5)
    expect(pickRepresentativeSamples(['only one lol'], 8)).toEqual(['only one lol'])
    expect(pickRepresentativeSamples(many, 0)).toEqual([])
    expect(pickRepresentativeSamples(many, -3)).toEqual([])
  })

  it('is deterministic and breaks ties by input order', () => {
    const input = ['sounds good to me', 'works for me tonight', 'see you at the usual spot', 'yeah that is fine']
    const a = pickRepresentativeSamples(input, 3)
    const b = pickRepresentativeSamples([...input], 3)
    expect(a).toEqual(b)
    // All score the same, so the earliest candidates win.
    expect(pickRepresentativeSamples(['alpha beta gamma', 'delta epsilon zeta'], 1)).toEqual(['alpha beta gamma'])
  })

  it('returns strings exactly as typed', () => {
    const typed = ['  heyyy   WHATS up?? ', 'ok so basically...  i think we\tshould go']
    const picked = pickRepresentativeSamples(typed, 5)
    expect(picked.sort()).toEqual([...typed].sort())
  })

  it('mixes short, medium and long messages when quality is similar', () => {
    const short = 'yeah sounds good'
    const mediumA = 'ok so i was thinking we could grab dinner after work on thursday maybe'
    const mediumB = 'ok so i was thinking we could skip the meeting and just email everyone instead'
    const long =
      'honestly i have been going back and forth on this for a while now and i keep ending up in the same place which is that we should just do it and see what happens'
    const picked = pickRepresentativeSamples([mediumA, mediumB, short, long], 3)
    expect(picked).toContain(short)
    expect(picked).toContain(long)
    expect(picked.filter((s) => s === mediumA || s === mediumB)).toHaveLength(1)
  })

  it('avoids repeating what is already picked and excludes it from the output', () => {
    const picked = pickRepresentativeSamples(['heyyy whats up bro', 'omw rn, see ya soon'], 2, ['hey whats up bro'])
    expect(picked).toEqual(['omw rn, see ya soon'])
  })

  it('handles empty and unusable input', () => {
    expect(pickRepresentativeSamples([], 5)).toEqual([])
    expect(pickRepresentativeSamples(['', '   ', '!!!', '12345'], 5)).toEqual([])
    expect(pickRepresentativeSamples(['  ', 'real one lol'], 5)).toEqual(['real one lol'])
  })
})
