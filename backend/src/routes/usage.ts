import { Hono } from 'hono'
import { peekUsage } from '../middleware/usageLimit.js'

export const usageRoute = new Hono()

// Read-only — lets the panel show today's count as soon as it opens,
// instead of only after the first Improve click.
usageRoute.get('/', async (c) => {
  const usage = await peekUsage(c, { limit: Number(process.env.FREE_DAILY_LIMIT) || 20, kvBinding: 'USAGE_KV' })
  return c.json({ usage })
})
