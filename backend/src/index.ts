import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { stylesRoute } from './routes/styles.js'
import { improveRoute } from './routes/improve.js'
import { rateLimit } from './middleware/rateLimit.js'

export const app = new Hono()

app.use(
  '*',
  cors({
    origin: (origin) => (origin === process.env.ALLOWED_ORIGIN ? origin : ''),
  }),
)

app.use('/api/improve', rateLimit({ limit: 20, windowMs: 60_000 }))

app.route('/api/styles', stylesRoute)
app.route('/api/improve', improveRoute)

if (process.env.NODE_ENV !== 'test') {
  const { serve } = await import('@hono/node-server')
  const port = Number(process.env.PORT) || 8787
  serve({ fetch: app.fetch, port })
  console.log(`Backend listening on http://localhost:${port}`)
}
