import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { stylesRoute } from './routes/styles.js'
import { improveRoute } from './routes/improve.js'
import { replyRoute } from './routes/reply.js'
import { usageRoute } from './routes/usage.js'
import { deviceStateRoute } from './routes/deviceState.js'
import { profileRoute } from './routes/profile.js'
import { rateLimit } from './middleware/rateLimit.js'
import { usageLimit } from './middleware/usageLimit.js'
import { ratingGate } from './middleware/ratingGate.js'
import { googleRequired } from './middleware/googleRequired.js'

export const app = new Hono()

app.use(
  '*',
  cors({
    origin: (origin) => (origin === process.env.ALLOWED_ORIGIN ? origin : ''),
  }),
)

// Burst protection (per IP, resets every minute) plus the persistent free
// allowance (per device, resets daily) — the latter is what the "Free" badge
// in the extension actually promises, and survives Worker restarts.
app.use('/api/improve', rateLimit({ limit: 20, windowMs: 60_000 }))
// Sign-in is compulsory: device-only callers are refused before any quota is
// spent, so usageLimit/ratingGate below only ever see verified Google identities.
app.use('/api/improve', googleRequired)
app.use('/api/improve', usageLimit({ limit: Number(process.env.FREE_DAILY_LIMIT) || 20, kvBinding: 'USAGE_KV' }))
app.use('/api/improve', ratingGate)

// Reply-drafting shares /api/improve's chain (and its per-device allowance):
// same burst limit, same compulsory sign-in, same usage and rating gates.
app.use('/api/reply', rateLimit({ limit: 20, windowMs: 60_000 }))
app.use('/api/reply', googleRequired)
app.use('/api/reply', usageLimit({ limit: Number(process.env.FREE_DAILY_LIMIT) || 20, kvBinding: 'USAGE_KV' }))
app.use('/api/reply', ratingGate)

// The writing profile belongs to a Google account (keyed on the verified sub),
// so it's refused for device-only callers the same way /api/improve is.
app.use('/api/profile', rateLimit({ limit: 30, windowMs: 60_000 }))
app.use('/api/profile', googleRequired)

app.route('/api/styles', stylesRoute)
app.route('/api/improve', improveRoute)
app.route('/api/reply', replyRoute)
app.route('/api/usage', usageRoute)
app.route('/api/device-state', deviceStateRoute)
app.route('/api/profile', profileRoute)

// Cloudflare Workers entry. Local Node dev lives in server.ts.
export default app
