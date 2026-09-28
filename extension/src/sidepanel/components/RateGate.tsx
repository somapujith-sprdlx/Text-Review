import { useEffect, useState } from 'react'
import { RATING_GATE_THRESHOLD } from '../../../../shared/rating.js'
import { claimRating, fetchDeviceState, linkGoogleAccount } from '../../services/deviceState.js'
import type { DeviceState } from '../../types/index.js'

// Placeholder until Lipi is actually live on the Chrome Web Store — the zip
// builds in the repo root haven't been published yet. Update once it is.
const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/'

interface Props {
  onClaimed: (state: DeviceState) => void
  // Fired after Step A (Google sign-in) succeeds, so a parent tracking its
  // own DeviceState copy (e.g. App.tsx) can stay in sync. Optional so
  // existing `<RateGate onClaimed={...} />` call sites keep compiling
  // unchanged — this component learns googleLinked itself either way (see
  // the mount effect below), so nothing actually depends on this prop.
  onLinked?: (state: DeviceState) => void
}

// Hard, sequential gate: Step A (Google sign-in) must complete before Step B
// (the self-reported rating claim) is even shown — there is no skip/bypass
// between them. Signing in ties this gate's progress to a verified Google
// account instead of the anonymous, resettable device id, so reinstalling
// the extension can no longer reset the count back to zero.
//
// This component fetches its own device state on mount rather than trusting
// a prop, so it renders the correct step regardless of what any parent
// happens to pass in.
export function RateGate({ onClaimed, onLinked }: Props) {
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null)
  const [opened, setOpened] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  // Cached read first (avoids a flash of the wrong step before we know
  // googleLinked), then a fresh fetch to reconcile — same pattern App.tsx
  // uses for its own device state.
  useEffect(() => {
    let cancelled = false
    chrome.storage.local.get('deviceStateCache').then((local) => {
      if (cancelled) return
      const cached = local.deviceStateCache as DeviceState | undefined
      if (cached) setDeviceState(cached)
    })
    void fetchDeviceState().then((state) => {
      if (!cancelled && state) setDeviceState(state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function openStore() {
    window.open(CHROME_WEB_STORE_URL, '_blank', 'noopener')
    setOpened(true)
  }

  async function handleSignIn() {
    setLinking(true)
    setLinkError(null)
    const state = await linkGoogleAccount(true)
    setLinking(false)
    if (state) {
      setDeviceState(state)
      onLinked?.(state)
    } else {
      setLinkError('Something went wrong signing in. Try again.')
    }
  }

  async function handleClaim() {
    setClaiming(true)
    setClaimError(null)
    const state = await claimRating()
    setClaiming(false)
    if (state) onClaimed(state)
    else setClaimError('Something went wrong. Try again.')
  }

  const googleLinked = deviceState?.googleLinked === true

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-racing-50 px-4 py-8 text-racing-950">
      <section className="rounded-xl border border-brass/60 bg-white p-5 shadow-sm">
        <h1 className="text-base font-semibold text-racing-900">
          You&rsquo;ve made {RATING_GATE_THRESHOLD} improvements with Lipi 🎉
        </h1>

        {!googleLinked ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-racing-800/85">
              Sign in with Google to continue — so your progress survives if you ever reinstall Lipi.
            </p>

            <button
              type="button"
              onClick={handleSignIn}
              disabled={linking}
              className="mt-4 w-full rounded-lg bg-racing-900 py-2.5 text-sm font-semibold text-white hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-racing-50 disabled:opacity-50"
            >
              {linking ? 'Signing in…' : 'Sign in with Google'}
            </button>

            {linkError && (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {linkError}
              </p>
            )}

            <p className="mt-4 border-t border-racing-900/10 pt-3 text-xs leading-relaxed text-racing-800/70">
              We only use your Google account to verify you&rsquo;re a real, returning user — not to post or share
              anything.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-racing-800/85">
              Please rate Lipi on the Chrome Web Store to keep going — it really helps us grow.
            </p>

            <button
              type="button"
              onClick={openStore}
              className="mt-4 w-full rounded-lg bg-racing-900 py-2.5 text-sm font-semibold text-white hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-racing-50"
            >
              Rate Lipi on the Chrome Web Store
            </button>

            <button
              type="button"
              onClick={handleClaim}
              disabled={!opened || claiming}
              className="mt-2 w-full rounded-lg border border-racing-900/20 px-3 py-2.5 text-sm font-medium text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:opacity-50"
            >
              {claiming ? 'Saving…' : "I've left my rating"}
            </button>
            {!opened && (
              <p className="mt-2 text-xs text-racing-800/70">Click the button above first, then come back here.</p>
            )}
            {claimError && (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {claimError}
              </p>
            )}

            <p className="mt-4 border-t border-racing-900/10 pt-3 text-xs leading-relaxed text-racing-800/70">
              This is self-reported — we don&rsquo;t verify it, we just trust you. Thank you for supporting Lipi.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
