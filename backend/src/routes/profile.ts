import { Hono } from 'hono'
import { resolveIdentity } from '../lib/identity.js'
import { getProfile, saveProfile } from '../services/db/profile.js'

// Mounted behind googleRequired (see index.ts), so by the time a handler runs
// the caller has a verified Google identity; the kind check below is only a
// type narrowing / defence in depth.
export const profileRoute = new Hono()

profileRoute.get('/', async (c) => {
  const identity = await resolveIdentity(c)
  if (!identity || identity.kind !== 'google') {
    return c.json({ error: 'Please sign in with Google to use Lipi.', code: 'SIGN_IN_REQUIRED' }, 401)
  }
  return c.json({ profile: await getProfile(identity.key) })
})

// The body is passed to saveProfile, which runs it through sanitizeProfile —
// unknown enum values become 'default' and free text is collapsed and capped,
// so no separate size limit is needed here.
profileRoute.put('/', async (c) => {
  const identity = await resolveIdentity(c)
  if (!identity || identity.kind !== 'google') {
    return c.json({ error: 'Please sign in with Google to use Lipi.', code: 'SIGN_IN_REQUIRED' }, 401)
  }

  let payload: { profile?: unknown }
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400)
  }

  const raw = payload?.profile
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return c.json({ error: 'A profile object is required.' }, 400)
  }

  const saved = await saveProfile(identity.key, raw)
  if (!saved) {
    return c.json({ error: "Couldn't save your preferences. Try again." }, 503)
  }
  return c.json({ profile: saved })
})
