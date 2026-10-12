import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same fake-Neon pattern as linkGoogleAccount.test.ts: each test scripts the
// result sets the statement should see. `sqlAvailable` flips getSql() to null
// to cover the "DATABASE_URL not configured" path.
const query = vi.fn()
let sqlAvailable = true
vi.mock('../src/services/db/client.js', () => ({
  getSql: () => (sqlAvailable ? { query } : null),
}))

import { getProfile, saveProfile } from '../src/services/db/profile.js'
import { DEFAULT_PROFILE } from '../../shared/profile.js'

function row(overrides: Record<string, unknown> = {}) {
  return {
    tone: 'default',
    verbosity: 'default',
    emoji_usage: 'default',
    custom_instructions: '',
    writing_samples: [],
    ...overrides,
  }
}

describe('getProfile', () => {
  beforeEach(() => {
    query.mockReset()
    sqlAvailable = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('maps the stored row to a WritingProfile', async () => {
    query.mockResolvedValueOnce([
      row({
        tone: 'friendly',
        verbosity: 'detailed',
        emoji_usage: 'rare',
        custom_instructions: 'Be kind.',
        writing_samples: ['heyyy whats up', 'k sounds gud'],
      }),
    ])

    const profile = await getProfile('g-1')

    expect(profile).toEqual({
      tone: 'friendly',
      verbosity: 'detailed',
      emojiUsage: 'rare',
      customInstructions: 'Be kind.',
      writingSamples: ['heyyy whats up', 'k sounds gud'],
    })
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('writing_samples')
    expect(sql).toContain('FROM user_profiles WHERE google_sub = $1')
    expect(params).toEqual(['g-1'])
  })

  it('returns defaults when there is no row', async () => {
    query.mockResolvedValueOnce([])
    expect(await getProfile('g-1')).toEqual(DEFAULT_PROFILE)
  })

  it('returns defaults when no database is configured', async () => {
    sqlAvailable = false
    expect(await getProfile('g-1')).toEqual(DEFAULT_PROFILE)
    expect(query).not.toHaveBeenCalled()
  })

  it('fails open to defaults when the database throws', async () => {
    query.mockRejectedValue(new Error('neon down'))
    expect(await getProfile('g-1')).toEqual(DEFAULT_PROFILE)
  })

  it('treats malformed stored writing_samples as no samples', async () => {
    for (const bad of ['not json', '{"a":1}', 42, null, { a: 1 }, [1, null, {}]]) {
      query.mockResolvedValueOnce([row({ writing_samples: bad })])
      expect((await getProfile('g-1')).writingSamples).toEqual([])
    }
  })

  it('accepts writing_samples delivered as a JSON string and caps/cleans them', async () => {
    const long = 'x'.repeat(500)
    query.mockResolvedValueOnce([row({ writing_samples: JSON.stringify(['  hi\nthere  ', '', long]) })])
    const { writingSamples } = await getProfile('g-1')
    expect(writingSamples).toHaveLength(2)
    expect(writingSamples[0]).toBe('hi there')
    expect(writingSamples[1]).toHaveLength(240)
  })

  it('sanitizes values read back from the table', async () => {
    query.mockResolvedValueOnce([row({ tone: 'sarcastic', custom_instructions: '  a \n b  ' })])
    expect(await getProfile('g-1')).toEqual({ ...DEFAULT_PROFILE, customInstructions: 'a b' })
  })
})

describe('saveProfile', () => {
  beforeEach(() => {
    query.mockReset()
    sqlAvailable = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('upserts the sanitized profile keyed on google_sub and returns the stored row', async () => {
    query.mockResolvedValueOnce([
      row({ tone: 'formal', verbosity: 'short', emoji_usage: 'none', custom_instructions: 'No slang.' }),
    ])

    const saved = await saveProfile('g-1', {
      tone: 'formal',
      verbosity: 'short',
      emojiUsage: 'none',
      customInstructions: '  No   slang.  ',
      writingSamples: ['  heyyy\nwassup  ', 'ok'],
    })

    expect(saved).toEqual({
      tone: 'formal',
      verbosity: 'short',
      emojiUsage: 'none',
      customInstructions: 'No slang.',
      writingSamples: [],
    })
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('INSERT INTO user_profiles')
    expect(sql).toContain('ON CONFLICT (google_sub) DO UPDATE')
    expect(sql).toContain('RETURNING')
    expect(sql).toContain('$6::jsonb')
    // Samples go over the wire as a JSON string for the ::jsonb cast, cleaned
    // by sanitizeProfile first (line breaks flattened, whitespace trimmed).
    expect(params).toEqual(['g-1', 'formal', 'short', 'none', 'No slang.', JSON.stringify(['heyyy wassup', 'ok'])])
  })

  it('sanitizes garbage before it reaches the database', async () => {
    query.mockResolvedValueOnce([row()])

    await saveProfile('g-1', { tone: 'x', customInstructions: 123 })

    expect(query.mock.calls[0][1]).toEqual(['g-1', 'default', 'default', 'default', '', '[]'])
  })

  it('returns null when no database is configured', async () => {
    sqlAvailable = false
    expect(await saveProfile('g-1', DEFAULT_PROFILE)).toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it('returns null (does not swallow the failure) when the database throws', async () => {
    query.mockRejectedValue(new Error('neon down'))
    expect(await saveProfile('g-1', DEFAULT_PROFILE)).toBeNull()
  })

  it('returns null when the upsert returns no row', async () => {
    query.mockResolvedValueOnce([])
    expect(await saveProfile('g-1', DEFAULT_PROFILE)).toBeNull()
  })
})
