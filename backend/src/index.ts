import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { stylesRoute } from './routes/styles.js'
import { improveRoute } from './routes/improve.js'
import { usageRoute } from './routes/usage.js'
import { deviceStateRoute } from './routes/deviceState.js'
import { rateLimit } from './middleware/rateLimit.js'
import { usageLimit } from './middleware/usageLimit.js'
import { ratingGate } from './middleware/ratingGate.js'

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
app.use('/api/improve', usageLimit({ limit: Number(process.env.FREE_DAILY_LIMIT) || 20, kvBinding: 'USAGE_KV' }))
app.use('/api/improve', ratingGate)

app.route('/api/styles', stylesRoute)
app.route('/api/improve', improveRoute)
app.route('/api/usage', usageRoute)
app.route('/api/device-state', deviceStateRoute)

// Cloudflare Workers entry. Local Node dev lives in server.ts.
export default app
