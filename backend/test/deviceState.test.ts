import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// DB access goes through process.env.DATABASE_URL (not c.env), following the
// same convention as keyPool.ts — so tests mock the service module instead
// of faking a KV-style env binding the way usageLimit.test.ts does.
vi.mock('../src/services/db/deviceState.js', () => ({
  getDeviceState: vi.fn(),
  incrementLifetimeImprovements: vi.fn(),
  markOnboardingComplete: vi.fn(),
  markRatingClaimed: vi.fn(),
  linkGoogleAccount: vi.fn(),
}))
vi.mock('../src/services/google.js', () => ({
  verifyGoogleAccessToken: vi.fn(),
}))

import { deviceStateRoute } from '../src/routes/deviceState.js'
import * as deviceStateService from '../src/services/db/deviceState.js'
import * as googleService from '../src/services/google.js'

function buildApp() {
  const app = new Hono()
  app.route('/device-state', deviceStateRoute)
  return app
}

const SAMPLE_STATE = {
  lifetimeImprovements: 3,
  onboardingCompleted: true,
  ratingRequired: false,
  googleLinked: false,
  email: null,
}

describe('deviceState route — device-id path (no Authorization header)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET / returns the device state for a valid device id', async () => {
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue(SAMPLE_STATE)
    const app = buildApp()
    const res = await app.request('/device-state', { headers: { 'x-device-id': 'device-aaaaaaaa' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deviceState: SAMPLE_STATE })
    expect(googleService.verifyGoogleAccessToken).not.toHaveBeenCalled()
  })

  it('GET / rejects a missing device id', async () => {
    const app = buildApp()
    const res = await app.request('/device-state')
    expect(res.status).toBe(400)
    expect(deviceStateService.getDeviceState).not.toHaveBeenCalled()
  })

  it('POST /increment returns the updated state', async () => {
    const updated = { ...SAMPLE_STATE, lifetimeImprovements: 5, ratingRequired: true }
    vi.mocked(deviceStateService.incrementLifetimeImprovements).mockResolvedValue(updated)
    const app = buildApp()
    const res = await app.request('/device-state/increment', {
      method: 'POST',
      headers: { 'x-device-id': 'device-aaaaaaaa' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deviceState: updated })
  })

  it('POST /onboarding-complete returns the updated state', async () => {
    const updated = { ...SAMPLE_STATE, onboardingCompleted: true }
    vi.mocked(deviceStateService.markOnboardingComplete).mockResolvedValue(updated)
    const app = buildApp()
    const res = await app.request('/device-state/onboarding-complete', {
      method: 'POST',
      headers: { 'x-device-id': 'device-aaaaaaaa' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deviceState: updated })
  })

  it('POST /rating-claimed clears ratingRequired', async () => {
    const updated = { ...SAMPLE_STATE, lifetimeImprovements: 5, ratingRequired: false }
    vi.mocked(deviceStateService.markRatingClaimed).mockResolvedValue(updated)
    const app = buildApp()
    const res = await app.request('/device-state/rating-claimed', {
      method: 'POST',
      headers: { 'x-device-id': 'device-aaaaaaaa' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deviceState: updated })
  })

  it('POST routes reject a missing device id', async () => {
    const app = buildApp()
    const res = await app.request('/device-state/increment', { method: 'POST' })
    expect(res.status).toBe(400)
    expect(deviceStateService.incrementLifetimeImprovements).not.toHaveBeenCalled()
  })
})

describe('deviceState route — Google identity path (Authorization header present)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET / resolves via the verified Google identity when the bearer token is valid', async () => {
    vi.mocked(googleService.verifyGoogleAccessToken).mockResolvedValue({ sub: 'g-123', email: 'a@example.com' })
    const linkedState = { ...SAMPLE_STATE, googleLinked: true, email: 'a@example.com' }
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue(linkedState)

    const app = buildApp()
    const res = await app.request('/device-state', {
      headers: { 'x-device-id': 'device-aaaaaaaa', authorization: 'Bearer good-token' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deviceState: linkedState })
    expect(deviceStateService.getDeviceState).toHaveBeenCalledWith({ kind: 'google', key: 'g-123', email: 'a@example.com' })
  })

  it('falls back to the device id when the bearer token is rejected by Google', async () => {
    vi.mocked(googleService.verifyGoogleAccessToken).mockResolvedValue(null)
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue(SAMPLE_STATE)

    const app = buildApp()
    const res = await app.request('/device-state', {
      headers: { 'x-device-id': 'device-aaaaaaaa', authorization: 'Bearer bad-token' },
    })
    expect(res.status).toBe(200)
    expect(deviceStateService.getDeviceState).toHaveBeenCalledWith({ kind: 'device', key: 'device-aaaaaaaa' })
  })
})

describe('POST /device-state/link-google', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links a new Google account and returns the updated state', async () => {
    vi.mocked(googleService.verifyGoogleAccessToken).mockResolvedValue({ sub: 'g-123', email: 'a@example.com' })
    const linked = { ...SAMPLE_STATE, googleLinked: true, email: 'a@example.com' }
    vi.mocked(deviceStateService.linkGoogleAccount).mockResolvedValue(linked)

    const app = buildApp()
    const res = await app.request('/device-state/link-google', {
      method: 'POST',
      headers: { 'x-device-id': 'device-aaaaaaaa', authorization: 'Bearer good-token' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deviceState: linked })
    expect(deviceStateService.linkGoogleAccount).toHaveBeenCalledWith('device-aaaaaaaa', 'g-123', 'a@example.com')
  })

  it('rejects a missing device id', async () => {
    const app = buildApp()
    const res = await app.request('/device-state/link-google', {
      method: 'POST',
      headers: { authorization: 'Bearer good-token' },
    })
    expect(res.status).toBe(400)
    expect(deviceStateService.linkGoogleAccount).not.toHaveBeenCalled()
  })

  it('rejects a missing Authorization header', async () => {
    const app = buildApp()
    const res = await app.request('/device-state/link-google', {
      method: 'POST',
      headers: { 'x-device-id': 'device-aaaaaaaa' },
    })
    expect(res.status).toBe(400)
    expect(deviceStateService.linkGoogleAccount).not.toHaveBeenCalled()
  })

  it('rejects a token Google does not recognize with 401', async () => {
    vi.mocked(googleService.verifyGoogleAccessToken).mockResolvedValue(null)
    const app = buildApp()
    const res = await app.request('/device-state/link-google', {
      method: 'POST',
      headers: { 'x-device-id': 'device-aaaaaaaa', authorization: 'Bearer bad-token' },
    })
    expect(res.status).toBe(401)
    expect(deviceStateService.linkGoogleAccount).not.toHaveBeenCalled()
  })
})
