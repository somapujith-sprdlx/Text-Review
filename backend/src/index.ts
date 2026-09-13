import { Hono } from 'hono'
import { stylesRoute } from './routes/styles.js'

export const app = new Hono()

app.route('/api/styles', stylesRoute)

if (process.env.NODE_ENV !== 'test') {
  const { serve } = await import('@hono/node-server')
  const port = Number(process.env.PORT) || 8787
  serve({ fetch: app.fetch, port })
  console.log(`Backend listening on http://localhost:${port}`)
}
