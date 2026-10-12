import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { generateReplies } from '../services/ai/provider.js'
import { QuotaExhaustedError } from '../services/ai/errors.js'
import { getUsageInfo } from '../middleware/usageLimit.js'
import { sanitizeProfile } from '../../../shared/profile.js'
import { MAX_REPLY_SOURCE_LENGTH } from '../../../shared/reply.js'

export const replyRoute = new Hono()

// Mounted behind rateLimit → googleRequired → usageLimit → ratingGate (see
// index.ts), exactly like /api/improve: a reply spends one use of the same
// shared allowance.
replyRoute.post('/', async (c) => {
  let payload: { text?: unknown; profile?: unknown }

  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400)
  }

  if (typeof payload !== 'object' || payload === null) {
    return c.json({ error: 'Invalid request body.' }, 400)
  }

  const { text, profile } = payload

  if (typeof text !== 'string' || text.trim().length === 0) {
    return c.json({ error: 'Text is required.' }, 400)
  }

  if (text.length > MAX_REPLY_SOURCE_LENGTH) {
    return c.json(
      { error: 'This message is too long to reply to. Please select a shorter part of it.' },
      400,
    )
  }

  try {
    const replies = await generateReplies({
      text,
      // The extension sends its cached profile (including writing samples);
      // never trust its shape. Missing stays undefined so no style block is added.
      profile: profile === undefined || profile === null ? undefined : sanitizeProfile(profile),
    })

    return c.json({
      requestId: randomUUID(),
      replies,
      usage: getUsageInfo(c),
    })
  } catch (err) {
    console.error('generateReplies failed:', err)
    if (err instanceof QuotaExhaustedError) {
      return c.json(
        { error: "You've reached your current usage limit.", code: 'LIMIT_REACHED' },
        429,
      )
    }
    return c.json({ error: 'Something went wrong. Try again.' }, 502)
  }
})
