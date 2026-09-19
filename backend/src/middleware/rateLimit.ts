import type { Context, Next } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

export function rateLimit(opts: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>()

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const bucket = buckets.get(ip)

    if (!bucket || bucket.resetAt < now) {
      buckets.set(ip, { count: 1, resetAt: now + opts.windowMs })
      await next()
      return
    }

    if (bucket.count >= opts.limit) {
      return c.json({ error: "You've reached your current usage limit." }, 429)
    }

    bucket.count += 1
    await next()
  }
}
