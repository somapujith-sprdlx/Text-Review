import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { usageLimit } from '../src/middleware/usageLimit.js'

function buildApp() {
  const app = new Hono()
  app.use('/limited', usageLimit({ limit: 2, kvBinding: 'USAGE_KV' }))
  app.get('/limited', (c) => c.json({ ok: true }))
  return app
}

// Minimal in-memory stand-in for the Cloudflare KV binding, so tests exercise
// the same code path production uses instead of the in-memory dev fallback.
function fakeKV() {
  const store = new Map<string, string>()
  return {
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string) {
      store.set(key, value)
    },
  }
}

describe('usageLimit middleware (no KV binding — in-memory fallback)', () => {
  it('allows requests under the limit', async () => {
    const app = buildApp()
    const headers = { 'x-device-id': 'device-aaaaaaaa' }
    const res1 = await app.request('/limited', { headers })
    const res2 = await app.request('/limited', { headers })
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })

  it('blocks requests over the limit with 429 and LIMIT_REACHED', async () => {
    const app = buildApp()
    const headers = { 'x-device-id': 'device-bbbbbbbb' }
    await app.request('/limited', { headers })
    await app.request('/limited', { headers })
    const res3 = await app.request('/limited', { headers })
    expect(res3.status).toBe(429)
    expect(await res3.json()).toMatchObject({ code: 'LIMIT_REACHED' })
  })

  it('tracks separate devices independently', async () => {
    const app = buildApp()
    await app.request('/limited', { headers: { 'x-device-id': 'device-cccccccc' } })
    await app.request('/limited', { headers: { 'x-device-id': 'device-cccccccc' } })
    const resOtherDevice = await app.request('/limited', { headers: { 'x-device-id': 'device-dddddddd' } })
    expect(resOtherDevice.status).toBe(200)
  })

  it('falls back to IP when no device id header is sent', async () => {
    const app = buildApp()
    const headers = { 'x-forwarded-for': '5.5.5.5' }
    await app.request('/limited', { headers })
    await app.request('/limited', { headers })
    const res3 = await app.request('/limited', { headers })
    expect(res3.status).toBe(429)
  })
})

describe('usageLimit middleware (with KV binding)', () => {
  it('persists the count in the bound KV namespace', async () => {
    const app = buildApp()
    const kv = fakeKV()
    const env = { USAGE_KV: kv }
    const headers = { 'x-device-id': 'device-eeeeeeee' }

    await app.request('/limited', { headers }, env)
    await app.request('/limited', { headers }, env)
    const res3 = await app.request('/limited', { headers }, env)

    expect(res3.status).toBe(429)
  })

  it('keeps KV-backed and in-memory-fallback counts separate', async () => {
    const app = buildApp()
    const kv = fakeKV()
    const env = { USAGE_KV: kv }
    const headers = { 'x-device-id': 'device-ffffffff' }

    // Two requests go through KV (this device's quota there is now spent)...
    await app.request('/limited', { headers }, env)
    await app.request('/limited', { headers }, env)

    // ...a request with no env falls back to the separate in-memory bucket
    // for the same device id, which hasn't seen any requests yet.
    const resNoEnv = await app.request('/limited', { headers })
    expect(resNoEnv.status).toBe(200)
  })
})
