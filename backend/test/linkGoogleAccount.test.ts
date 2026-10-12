import { describe, it, expect, vi, beforeEach } from 'vitest'

// Minimal fake of the Neon query function — each test scripts the sequence of
// result sets the three statements in linkGoogleAccount() should see.
const query = vi.fn()
vi.mock('../src/services/db/client.js', () => ({
  getSql: () => ({ query }),
}))

import { linkGoogleAccount } from '../src/services/db/deviceState.js'

function row(overrides: Record<string, unknown> = {}) {
  return {
    lifetime_improvements: 0,
    onboarding_completed_at: null,
    rating_claimed_at: null,
    google_sub: null,
    email: null,
    ...overrides,
  }
}

describe('linkGoogleAccount', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('(a) returns the existing row for this google_sub untouched', async () => {
    query.mockResolvedValueOnce([row({ lifetime_improvements: 7, google_sub: 'g-1', email: 'a@example.com' })])

    const state = await linkGoogleAccount('device-aaaaaaaa', 'g-1', 'a@example.com')

    expect(state).toMatchObject({ lifetimeImprovements: 7, googleLinked: true, email: 'a@example.com' })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('(b) attaches the sub to an unlinked device row, keeping its progress', async () => {
    query
      .mockResolvedValueOnce([]) // no row for this sub yet
      .mockResolvedValueOnce([row({ lifetime_improvements: 4, google_sub: 'g-1', email: 'a@example.com' })])

    const state = await linkGoogleAccount('device-aaaaaaaa', 'g-1', 'a@example.com')

    expect(state).toMatchObject({ lifetimeImprovements: 4, googleLinked: true })
    expect(query).toHaveBeenCalledTimes(2)
    const [sql, params] = query.mock.calls[1]
    expect(sql).toContain('WHERE device_state.google_sub IS NULL')
    expect(params).toEqual(['device-aaaaaaaa', 'g-1', 'a@example.com'])
  })

  it('(c) creates a fresh row under a synthetic device_id when the device is linked to another account', async () => {
    query
      .mockResolvedValueOnce([]) // no row for this sub yet
      .mockResolvedValueOnce([]) // device row belongs to a different sub -> guarded update matched nothing
      .mockResolvedValueOnce([row({ google_sub: 'g-2', email: 'b@example.com' })])

    const state = await linkGoogleAccount('device-aaaaaaaa', 'g-2', 'b@example.com')

    expect(state).toEqual({
      lifetimeImprovements: 0,
      onboardingCompleted: false,
      ratingRequired: false,
      googleLinked: true,
      email: 'b@example.com',
    })
    expect(query).toHaveBeenCalledTimes(3)
    const [sql, params] = query.mock.calls[2]
    expect(params).toEqual(['device-aaaaaaaa:g-2', 'g-2', 'b@example.com'])
    // The other account's row must never be the conflict target's update.
    expect(sql).not.toContain('SET google_sub')
  })

  it('fails open to the default state when the database throws', async () => {
    query.mockRejectedValue(new Error('neon down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const state = await linkGoogleAccount('device-aaaaaaaa', 'g-1', 'a@example.com')

    expect(state).toEqual({
      lifetimeImprovements: 0,
      onboardingCompleted: false,
      ratingRequired: false,
      googleLinked: false,
      email: null,
    })
  })
})
