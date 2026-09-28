import type { DeviceState } from '../types/index.js'

// Mirrors deviceState.ts's own cache key. Duplicated as a literal (rather
// than importing it from deviceState.ts) so this file stays a one-way leaf
// dependency — deviceState.ts already imports signInWithGoogle from here,
// and importing back would make the two modules circular.
const DEVICE_STATE_CACHE_KEY = 'deviceStateCache'

// Best-effort, like deviceState.ts's call() helper: every failure (user
// closes the consent popup, offline, no cached token to silently refresh,
// etc.) resolves to null instead of throwing, so callers never need a
// try/catch of their own.
export async function signInWithGoogle(interactive: boolean): Promise<string | null> {
  try {
    // chrome.identity.getAuthToken's promise form (no callback) resolves to
    // { token?, grantedScopes? } and rejects on failure — it does NOT resolve
    // to the token string directly (that's only the callback form's first
    // argument). See https://developer.chrome.com/docs/extensions/reference/api/identity.
    const result = await chrome.identity.getAuthToken({ interactive })
    return typeof result.token === 'string' && result.token.length > 0 ? result.token : null
  } catch {
    return null
  }
}

// Revokes whatever Google OAuth token this browser has cached and clears
// the local record that it was ever linked. Not wired to any UI yet — kept
// here as the counterpart to signInWithGoogle for whenever an "unlink"
// control exists.
export async function signOutOfGoogle(): Promise<void> {
  const token = await signInWithGoogle(false)
  if (token) {
    try {
      await chrome.identity.removeCachedAuthToken({ token })
    } catch {
      // Best-effort revoke — nothing else to do if Chrome rejects this.
    }
  }

  const stored = await chrome.storage.local.get(DEVICE_STATE_CACHE_KEY)
  const cached = stored[DEVICE_STATE_CACHE_KEY] as DeviceState | undefined
  if (cached) {
    await chrome.storage.local.set({
      [DEVICE_STATE_CACHE_KEY]: { ...cached, googleLinked: false, email: null },
    })
  }
}
