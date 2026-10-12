import type { Context, Next } from 'hono'
import { resolveIdentity } from '../lib/identity.js'

// Google sign-in is compulsory for the shared free tier: every lifetime /
// rating-gate counter is keyed on the verified Google account, so a request
// that only carries a (resettable) device id is refused here, before
// usageLimit/ratingGate spend any quota on it. Deliberately applied to
// /api/improve only — /api/device-state/* and /api/usage stay open to
// device-only identities so the extension can read its state and link Google
// before the user has signed in.
export async function googleRequired(c: Context, next: Next) {
  const identity = await resolveIdentity(c)
  if (!identity || identity.kind !== 'google') {
    return c.json({ error: 'Please sign in with Google to use Lipi.', code: 'SIGN_IN_REQUIRED' }, 401)
  }
  await next()
}
