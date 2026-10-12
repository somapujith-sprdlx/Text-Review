import { DEFAULT_PROFILE, sanitizeProfile, type WritingProfile } from '../../../shared/profile.js'
import { BASE_URL } from './config.js'
import { getDeviceId } from './deviceId.js'
import { fetchWithTimeout } from './fetchWithTimeout.js'
import { signInWithGoogle } from './googleAuth.js'

const STORAGE_KEY = 'writingProfile'
const TIMEOUT_MS = 10_000

// Cached locally because improveText() — including the service worker's Quick
// Mode and the bring-your-own-key path, which never touches the backend — needs
// the profile without an awaited network round trip. Always read through
// sanitizeProfile so a stale or hand-edited cache can never inject bad values
// into a prompt.
export async function getCachedProfile(): Promise<WritingProfile> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const raw = result[STORAGE_KEY]
    return raw === undefined ? DEFAULT_PROFILE : sanitizeProfile(raw)
  } catch {
    return DEFAULT_PROFILE
  }
}

async function authHeaders(): Promise<Record<string, string> | null> {
  // The profile routes require a verified Google identity; the token comes
  // silently from Chrome's cache, same as services/deviceState.ts.
  const token = await signInWithGoogle(false)
  if (!token) return null
  return {
    'Content-Type': 'application/json',
    'X-Device-Id': await getDeviceId(),
    Authorization: `Bearer ${token}`,
  }
}

async function request(method: 'GET' | 'PUT', profile?: WritingProfile): Promise<WritingProfile | null> {
  const headers = await authHeaders()
  if (!headers) return null
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/profile`,
    { method, headers, body: profile ? JSON.stringify({ profile }) : undefined },
    TIMEOUT_MS,
  )
  if (!res.ok) return null
  const body = (await res.json()) as { profile?: unknown }
  if (!body.profile) return null
  return sanitizeProfile(body.profile)
}

// Best-effort like deviceState.ts: any failure resolves null and leaves the
// cache exactly as it was.
export async function fetchProfile(): Promise<WritingProfile | null> {
  try {
    const profile = await request('GET')
    if (!profile) return null
    await chrome.storage.local.set({ [STORAGE_KEY]: profile })
    return profile
  } catch {
    return null
  }
}

// Resolves the server's copy on success. Resolves null on failure so the UI
// can show an error — and in that case the cache is deliberately not touched,
// so Quick Mode and BYOK never apply preferences the server doesn't have.
export async function saveProfile(profile: WritingProfile): Promise<WritingProfile | null> {
  try {
    const saved = await request('PUT', sanitizeProfile(profile))
    if (!saved) return null
    await chrome.storage.local.set({ [STORAGE_KEY]: saved })
    return saved
  } catch {
    return null
  }
}
