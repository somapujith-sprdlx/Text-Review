import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/services/db/profile.js', () => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
}))
vi.mock('../src/services/google.js', () => ({
  verifyGoogleAccessToken: vi.fn(),
}))

// The full app, so the googleRequired middleware and mounting in index.ts are
// exercised too. The route's rate limit (30/min per IP) is shared across this
// file's requests, so keep the total comfortably under that.
import { app } from '../src/index.js'
import { getProfile, saveProfile } from '../src/services/db/profile.js'
import { verifyGoogleAccessToken } from '../src/services/google.js'

const mockedGet = vi.mocked(getProfile)
const mockedSave = vi.mocked(saveProfile)
const mockedVerify = vi.mocked(verifyGoogleAccessToken)

const DEVICE_HEADERS = { 'X-Device-Id': 'device-profile-test' }
const GOOGLE_HEADERS = { ...DEVICE_HEADERS, Authorization: 'Bearer good-token' }

const STORED = { tone: 'friendly', verbosity: 'short', emojiUsage: 'none', customInstructions: 'Be kind.' } as const

function put(body: unknown, headers: Record<string, string> = GOOGLE_HEADERS) {
  return app.request('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('/api/profile', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedSave.mockReset()
    mockedVerify.mockReset()
    mockedVerify.mockResolvedValue({ sub: 'g-profile-test', email: 'a@example.com' })
  })

  describe('GET', () => {
    it('returns 401 SIGN_IN_REQUIRED for a device-only caller', async () => {
      const res = await app.request('/api/profile', { headers: DEVICE_HEADERS })
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' })
      expect(mockedGet).not.toHaveBeenCalled()
    })

    it('returns 401 SIGN_IN_REQUIRED when the token is rejected by Google', async () => {
      mockedVerify.mockResolvedValue(null)
      const res = await app.request('/api/profile', { headers: GOOGLE_HEADERS })
      expect(res.status).toBe(401)
      expect(mockedGet).not.toHaveBeenCalled()
    })

    it("returns the signed-in account's profile, looked up by the verified sub", async () => {
      mockedGet.mockResolvedValue({ ...STORED })
      const res = await app.request('/api/profile', { headers: GOOGLE_HEADERS })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ profile: STORED })
      expect(mockedGet).toHaveBeenCalledWith('g-profile-test')
    })
  })

  describe('PUT', () => {
    it('returns 401 SIGN_IN_REQUIRED for a device-only caller', async () => {
      const res = await put({ profile: STORED }, DEVICE_HEADERS)
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' })
      expect(mockedSave).not.toHaveBeenCalled()
    })

    it('saves the profile for the verified sub and returns what was stored', async () => {
      mockedSave.mockResolvedValue({ ...STORED })
      const res = await put({ profile: STORED })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ profile: STORED })
      expect(mockedSave).toHaveBeenCalledWith('g-profile-test', STORED)
    })

    it('returns 503 when the save fails', async () => {
      mockedSave.mockResolvedValue(null)
      const res = await put({ profile: STORED })
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: "Couldn't save your preferences. Try again." })
    })

    it('returns 400 on invalid JSON', async () => {
      const res = await put('{not json')
      expect(res.status).toBe(400)
      expect(mockedSave).not.toHaveBeenCalled()
    })

    it('returns 400 when the profile object is missing or not an object', async () => {
      for (const body of [{}, { profile: 'friendly' }, { profile: null }, { profile: ['a'] }, null]) {
        const res = await put(body)
        expect(res.status).toBe(400)
      }
      expect(mockedSave).not.toHaveBeenCalled()
    })
  })
})
