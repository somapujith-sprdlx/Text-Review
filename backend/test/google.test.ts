import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyGoogleAccessToken } from '../src/services/google.js'

describe('verifyGoogleAccessToken', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns sub/email for a token Google accepts', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ sub: 'g-123', email: 'a@example.com' }), { status: 200 }),
    )
    const result = await verifyGoogleAccessToken('good-token')
    expect(result).toEqual({ sub: 'g-123', email: 'a@example.com' })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      expect.objectContaining({ headers: { Authorization: 'Bearer good-token' } }),
    )
  })

  it('returns null when Google rejects the token', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('', { status: 401 }))
    expect(await verifyGoogleAccessToken('bad-token')).toBeNull()
  })

  it('returns null when the response is missing sub or email', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ sub: 'g-123' }), { status: 200 }))
    expect(await verifyGoogleAccessToken('token')).toBeNull()
  })

  it('returns null instead of throwing on a network failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network down'))
    expect(await verifyGoogleAccessToken('token')).toBeNull()
  })
})
