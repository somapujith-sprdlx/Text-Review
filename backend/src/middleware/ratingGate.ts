import type { Context, Next } from 'hono'
import { resolveIdentity } from '../lib/identity.js'
import { getDeviceState } from '../services/db/deviceState.js'

// Defense-in-depth for the shared free-tier pool only. Primary enforcement
// lives client-side in the extension (App.tsx / service-worker.ts) because
// it has to cover BYOK requests too, and those never reach this backend at
// all — see extension/src/services/api.ts's improveText(). This just stops
// someone from hitting the free allowance directly after bypassing the
// extension's own check. resolveIdentity prefers a verified Google identity
// over the device id when both are presented, so a linked device's check
// reflects its real (possibly reinstall-surviving) state, not a stale
// device-id-only row. No identity at all (e.g. a non-extension caller) is
// waved through here the same way usageLimit.ts falls back to an IP key —
// this middleware simply has nothing to gate on in that case.
export async function ratingGate(c: Context, next: Next) {
  const identity = await resolveIdentity(c)
  if (identity) {
    const state = await getDeviceState(identity)
    if (state.ratingRequired) {
      return c.json({ error: 'Please rate Lipi to keep using it.', code: 'RATING_REQUIRED' }, 403)
    }
  }
  await next()
}
