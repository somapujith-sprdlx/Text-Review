import type { DeviceState } from '../types/index.js'
import { BASE_URL } from './config.js'
import { getDeviceId } from './deviceId.js'
import { fetchWithTimeout } from './fetchWithTimeout.js'
import { signInWithGoogle } from './googleAuth.js'

const STORAGE_KEY = 'deviceStateCache'
const TIMEOUT_MS = 10_000

// Cached so the service worker's synchronous Quick Mode trigger decision
// (see service-worker.ts's handleTrigger) can check gate status without an
// awaited network round trip — same reasoning as usageCache.ts's cache.
function saveDeviceStateCache(state: DeviceState): Promise<void> {
  return chrome.storage.local.set({ [STORAGE_KEY]: state })
}

async function getCachedDeviceState(): Promise<DeviceState | undefined> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return result[STORAGE_KEY] as DeviceState | undefined
}

export function isRatingRequired(cached: DeviceState | undefined): boolean {
  return cached?.ratingRequired ?? false
}

export function isOnboardingCompleted(cached: DeviceState | undefined): boolean {
  return cached?.onboardingCompleted ?? false
}

// Every call is best-effort: a failure here must not block using the
// extension (the primary gate check reads the cache, which just stays
// whatever it was before), mirroring fetchUsage()'s error handling.
async function sendRequest(
  path: string,
  method: 'GET' | 'POST',
  extraHeaders: Record<string, string>,
): Promise<DeviceState | null> {
  try {
    const deviceId = await getDeviceId()
    const res = await fetchWithTimeout(
      `${BASE_URL}/api/device-state${path}`,
      { method, headers: { 'X-Device-Id': deviceId, ...extraHeaders } },
      TIMEOUT_MS,
    )
    if (!res.ok) return null
    const body = (await res.json()) as { deviceState?: DeviceState }
    if (!body.deviceState) return null
    void saveDeviceStateCache(body.deviceState)
    return body.deviceState
  } catch {
    return null
  }
}

async function call(path: string, method: 'GET' | 'POST'): Promise<DeviceState | null> {
  // Once this browser has linked a Google account, attach a fresh access
  // token on every call so the backend can key the gate off the verified
  // account instead of the resettable device id. Non-interactive, so it
  // resolves silently from Chrome's cache in the common case; if the token
  // can't be silently refreshed, just proceed device-id-only rather than
  // blocking or surfacing an error — the backend treats that as an
  // acceptable degraded (unauthenticated-by-Google) case, not a failure.
  let authHeaders: Record<string, string> = {}
  try {
    const cached = await getCachedDeviceState()
    if (cached?.googleLinked) {
      const token = await signInWithGoogle(false)
      if (token) authHeaders = { Authorization: `Bearer ${token}` }
    }
  } catch {
    // Best-effort — fall through to a device-id-only request.
  }
  return sendRequest(path, method, authHeaders)
}

// Read-only — called on panel mount so the gate/tour reflect the latest
// server state as soon as the panel opens.
export function fetchDeviceState(): Promise<DeviceState | null> {
  return call('', 'GET')
}

// Called after every successful improvement, free-tier or BYOK — both paths
// funnel through improveText() in api.ts, which is the only call site.
export function reportImprovementCompleted(): Promise<DeviceState | null> {
  return call('/increment', 'POST')
}

// Self-reported claim, not a verified check — see RateGate.tsx.
export function claimRating(): Promise<DeviceState | null> {
  return call('/rating-claimed', 'POST')
}

export function completeOnboarding(): Promise<DeviceState | null> {
  return call('/onboarding-complete', 'POST')
}

// Step A of the rating gate (see RateGate.tsx) — links this browser's
// Google account to the gate state so it survives a reinstall, instead of
// resetting with the device id. `interactive` should be true for the
// gate's own sign-in button (a deliberate user action); a silent retry
// would just fail non-interactively since there's nothing cached yet.
// Returns null (never throws) on any failure, including a token the
// backend rejects with 401 — the caller doesn't need to distinguish why,
// just that it didn't work and the user can try again.
export async function linkGoogleAccount(interactive: boolean): Promise<DeviceState | null> {
  const token = await signInWithGoogle(interactive)
  if (!token) return null
  return sendRequest('/link-google', 'POST', { Authorization: `Bearer ${token}` })
}
