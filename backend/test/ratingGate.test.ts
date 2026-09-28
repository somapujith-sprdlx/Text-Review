import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../src/services/db/deviceState.js', () => ({
  getDeviceState: vi.fn(),
}))
vi.mock('../src/services/google.js', () => ({
  verifyGoogleAccessToken: vi.fn(),
}))

import { ratingGate } from '../src/middleware/ratingGate.js'
import * as deviceStateService from '../src/services/db/deviceState.js'
import * as googleService from '../src/services/google.js'

function buildApp() {
  const app = new Hono()
  app.use('/gated', ratingGate)
  app.get('/gated', (c) => c.json({ ok: true }))
  return app
}

const BASE_STATE = { lifetimeImprovements: 2, onboardingCompleted: true, ratingRequired: false, googleLinked: false, email: null }

describe('ratingGate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows the request through when rating is not required', async () => {
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue(BASE_STATE)
    const app = buildApp()
    const res = await app.request('/gated', { headers: { 'x-device-id': 'device-aaaaaaaa' } })
    expect(res.status).toBe(200)
  })

  it('blocks with 403 RATING_REQUIRED once gated (device-id identity)', async () => {
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ...BASE_STATE,
      lifetimeImprovements: 5,
      ratingRequired: true,
    })
    const app = buildApp()
    const res = await app.request('/gated', { headers: { 'x-device-id': 'device-bbbbbbbb' } })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'RATING_REQUIRED' })
  })

  it('blocks with 403 when gated via a verified Google identity', async () => {
    vi.mocked(googleService.verifyGoogleAccessToken).mockResolvedValue({ sub: 'g-123', email: 'a@example.com' })
    vi.mocked(deviceStateService.getDeviceState).mockResolvedValue({
      ...BASE_STATE,
      lifetimeImprovements: 5,
      ratingRequired: true,
      googleLinked: true,
      email: 'a@example.com',
    })
    const app = buildApp()
    const res = await app.request('/gated', {
      headers: { 'x-device-id': 'device-cccccccc', authorization: 'Bearer good-token' },
    })
    expect(res.status).toBe(403)
    expect(deviceStateService.getDeviceState).toHaveBeenCalledWith({ kind: 'google', key: 'g-123', email: 'a@example.com' })
  })

  it('lets requests with no identity through — nothing to gate on', async () => {
    const app = buildApp()
    const res = await app.request('/gated')
    expect(res.status).toBe(200)
    expect(deviceStateService.getDeviceState).not.toHaveBeenCalled()
  })
})
