import { Hono, type Context } from 'hono'
import { getDeviceId } from '../lib/deviceId.js'
import { resolveIdentity } from '../lib/identity.js'
import { verifyGoogleAccessToken } from '../services/google.js'
import {
  getDeviceState,
  incrementLifetimeImprovements,
  linkGoogleAccount,
  markOnboardingComplete,
  markRatingClaimed,
} from '../services/db/deviceState.js'

export const deviceStateRoute = new Hono()

async function requireIdentity(c: Context) {
  const identity = await resolveIdentity(c)
  return identity ?? c.json({ error: 'Missing or invalid device id.' }, 400)
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

deviceStateRoute.get('/', async (c) => {
  const identity = await requireIdentity(c)
  if (isResponse(identity)) return identity
  return c.json({ deviceState: await getDeviceState(identity) })
})

// Called by the extension after every successful improvement — free-tier or
// BYOK — since BYOK requests never touch the rest of this backend. See
// extension/src/services/api.ts's improveText().
deviceStateRoute.post('/increment', async (c) => {
  const identity = await requireIdentity(c)
  if (isResponse(identity)) return identity
  return c.json({ deviceState: await incrementLifetimeImprovements(identity) })
})

deviceStateRoute.post('/onboarding-complete', async (c) => {
  const identity = await requireIdentity(c)
  if (isResponse(identity)) return identity
  return c.json({ deviceState: await markOnboardingComplete(identity) })
})

// Self-reported claim, not a verified check — there is no Chrome Web Store
// API to confirm a review was actually submitted. Once set this is
// permanent (see markRatingClaimed's COALESCE).
deviceStateRoute.post('/rating-claimed', async (c) => {
  const identity = await requireIdentity(c)
  if (isResponse(identity)) return identity
  return c.json({ deviceState: await markRatingClaimed(identity) })
})

// Ties this device's (already at-the-threshold) progress to a verified
// Google account, so it survives a reinstall — see lib/identity.ts and
// services/db/deviceState.ts's linkGoogleAccount(). Requires both headers
// directly (not resolveIdentity) since linking is specifically about
// establishing the google_sub <-> device_id relationship, not picking
// whichever identity happens to be presented.
deviceStateRoute.post('/link-google', async (c) => {
  const deviceId = getDeviceId(c)
  if (!deviceId) return c.json({ error: 'Missing or invalid device id.' }, 400)

  const authHeader = c.req.header('authorization')
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!bearer) return c.json({ error: 'Missing Google access token.' }, 400)

  const google = await verifyGoogleAccessToken(bearer)
  if (!google) return c.json({ error: 'Invalid or expired Google token.' }, 401)

  const deviceState = await linkGoogleAccount(deviceId, google.sub, google.email)
  return c.json({ deviceState })
})
