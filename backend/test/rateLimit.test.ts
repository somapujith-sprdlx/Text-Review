import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from '../src/middleware/rateLimit.js'

function buildApp() {
  const app = new Hono()
  app.use('/limited', rateLimit({ limit: 2, windowMs: 60_000 }))
  app.get('/limited', (c) => c.json({ ok: true }))
  return app
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit', async () => {
    const app = buildApp()
    const res1 = await app.request('/limited', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    const res2 = await app.request('/limited', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })

  it('blocks requests over the limit with 429', async () => {
    const app = buildApp()
    const ip = '2.2.2.2'
    await app.request('/limited', { headers: { 'x-forwarded-for': ip } })
    await app.request('/limited', { headers: { 'x-forwarded-for': ip } })
    const res3 = await app.request('/limited', { headers: { 'x-forwarded-for': ip } })
    expect(res3.status).toBe(429)
  })

  it('tracks separate IPs independently', async () => {
    const app = buildApp()
    await app.request('/limited', { headers: { 'x-forwarded-for': '3.3.3.3' } })
    await app.request('/limited', { headers: { 'x-forwarded-for': '3.3.3.3' } })
    const resOtherIp = await app.request('/limited', { headers: { 'x-forwarded-for': '4.4.4.4' } })
    expect(resOtherIp.status).toBe(200)
  })
})
