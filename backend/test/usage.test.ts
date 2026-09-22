import { describe, it, expect, beforeEach } from 'vitest'
import { app } from '../src/index.js'

describe('GET /api/usage', () => {
  beforeEach(() => {
    process.env.ALLOWED_ORIGIN = 'chrome-extension://test-ext-id'
  })

  it('reports zero used for a device that has never made a request', async () => {
    const res = await app.request('/api/usage', { headers: { 'x-device-id': 'peek-device-never-used' } })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.usage).toMatchObject({ used: 0, limit: 20 })
  })

  it('does not itself count as a request', async () => {
    const headers = { 'x-device-id': 'peek-device-idempotent' }
    await app.request('/api/usage', { headers })
    const res2 = await app.request('/api/usage', { headers })

    const body = await res2.json()
    expect(body.usage.used).toBe(0)
  })

  it('reflects a count from a prior /api/improve call', async () => {
    // Uses the ambient in-memory bucket from usageLimit's own increment path
    // — a real improve call would go through rateLimit + usageLimit first.
    const headers = { 'x-device-id': 'peek-device-after-improve' }
    await app.request('/api/improve', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Origin: 'chrome-extension://test-ext-id' },
      body: JSON.stringify({ text: 'placeholder', style: 'not-a-real-style' }),
    })

    const res = await app.request('/api/usage', { headers })
    const body = await res.json()
    // The improve call above was rejected for an invalid style (400) after
    // the usage middleware already ran, so it still spent one count.
    expect(body.usage.used).toBe(1)
  })
})
