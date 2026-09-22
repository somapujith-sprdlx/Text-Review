import type { Context, Next } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

// Local Node dev (server.ts) has no KV binding — falls back to this, same as
// the old in-memory rateLimit. Fine for dev; not durable across restarts.
const memoryBuckets = new Map<string, Bucket>()

interface KVNamespaceLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

// A device id (generated once per install, sent as X-Device-Id) tracks the
// free allowance per install instead of per IP, which under-counts on
// shared networks (offices, cafes) and over-counts nothing useful. Callers
// without one (non-extension clients, or the header stripped) fall back to
// IP so the endpoint still can't be hammered for free.
function usageKeyFor(c: Context): string {
  const deviceId = c.req.header('x-device-id')
  if (deviceId && /^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) return `device:${deviceId}`
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  return `ip:${ip}`
}

// KV has no atomic increment (get + put), so two requests from the same
// device landing in the same instant can both read the pre-increment count
// and undercount by one. Acceptable for a soft free-tier nudge that always
// offers a way past it (bring your own key) — not used for billing.
async function incrementInKV(kv: KVNamespaceLike, key: string, expirationTtl: number): Promise<number> {
  const raw = await kv.get(key)
  const count = (raw ? Number(raw) : 0) + 1
  await kv.put(key, String(count), { expirationTtl })
  return count
}

function incrementInMemory(key: string, windowMs: number): number {
  const now = Date.now()
  const bucket = memoryBuckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return 1
  }
  bucket.count += 1
  return bucket.count
}

function peekInMemory(key: string): number {
  const bucket = memoryBuckets.get(key)
  return bucket && bucket.resetAt >= Date.now() ? bucket.count : 0
}

export interface UsageInfo {
  used: number
  limit: number
}

// Read-only lookup for the panel to show the count on open, without
// spending a request the way the improve-route middleware below does.
export async function peekUsage(c: Context, opts: { limit: number; kvBinding: string }): Promise<UsageInfo> {
  const key = `usage:${usageKeyFor(c)}:${dayKey(new Date())}`
  const kv = (c.env as Record<string, unknown> | undefined)?.[opts.kvBinding] as KVNamespaceLike | undefined

  const count = kv ? Number((await kv.get(key)) ?? 0) : peekInMemory(key)
  return { used: Math.min(count, opts.limit), limit: opts.limit }
}

// Set on the context so the route handler can echo it back in the response
// body — the client shows it next to the "Free" badge.
export function getUsageInfo(c: Context): UsageInfo | undefined {
  return c.get('usageInfo') as UsageInfo | undefined
}

// Persistent per-device daily free allowance, backed by Cloudflare KV in
// production (survives Worker restarts/redeploys) and an in-memory map in
// local Node dev. Exceeding it returns the same 429/LIMIT_REACHED shape the
// client already treats as "offer the bring-your-own-Groq-key flow".
export function usageLimit(opts: { limit: number; kvBinding: string }) {
  return async (c: Context, next: Next) => {
    const key = `usage:${usageKeyFor(c)}:${dayKey(new Date())}`
    const kv = (c.env as Record<string, unknown> | undefined)?.[opts.kvBinding] as KVNamespaceLike | undefined

    const count = kv ? await incrementInKV(kv, key, 60 * 60 * 24 * 2) : incrementInMemory(key, 24 * 60 * 60 * 1000)
    const usage: UsageInfo = { used: Math.min(count, opts.limit), limit: opts.limit }
    c.set('usageInfo', usage)

    if (count > opts.limit) {
      return c.json({ error: "You've reached your current usage limit.", code: 'LIMIT_REACHED', usage }, 429)
    }

    await next()
  }
}
