import type { Context } from 'hono'
import { getDeviceId } from './deviceId.js'
import { verifyGoogleAccessToken } from '../services/google.js'

// A linked Google account (verified sub) takes priority over the resettable
// device id — that's the whole point (see middleware/ratingGate.ts and
// routes/deviceState.ts). Falls back to the existing device-id behavior
// unchanged for anyone who hasn't linked yet, so this is purely additive.
export type Identity = { kind: 'device'; key: string } | { kind: 'google'; key: string; email: string }

const BEARER_PATTERN = /^Bearer\s+(.+)$/i

export async function resolveIdentity(c: Context): Promise<Identity | null> {
  const authHeader = c.req.header('authorization')
  const bearer = authHeader?.match(BEARER_PATTERN)?.[1]
  if (bearer) {
    const google = await verifyGoogleAccessToken(bearer)
    if (google) return { kind: 'google', key: google.sub, email: google.email }
  }

  const deviceId = getDeviceId(c)
  return deviceId ? { kind: 'device', key: deviceId } : null
}
