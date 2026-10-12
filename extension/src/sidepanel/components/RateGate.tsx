import { useState } from 'react'
import { RATING_GATE_THRESHOLD } from '../../../../shared/rating.js'
import { claimRating } from '../../services/deviceState.js'
import type { DeviceState } from '../../types/index.js'

// When Lipi is installed from the Chrome Web Store, chrome.runtime.id is the
// listing's own id, so this lands directly on Lipi's reviews page.
function reviewsUrl(): string {
  return `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`
}

interface Props {
  onClaimed: (state: DeviceState) => void
}

// Hard gate shown once the improvement threshold is reached. Google sign-in
// is compulsory and always happens before this screen (see SignInGate.tsx),
// so all that's left here is the self-reported rating claim.
export function RateGate({ onClaimed }: Props) {
  const [opened, setOpened] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  function openStore() {
    window.open(reviewsUrl(), '_blank', 'noopener')
    setOpened(true)
  }

  async function handleClaim() {
    setClaiming(true)
    setClaimError(null)
    const state = await claimRating()
    setClaiming(false)
    if (state) onClaimed(state)
    else setClaimError('Something went wrong. Try again.')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-racing-50 px-4 py-8 text-racing-950">
      <section className="rounded-xl border border-brass/60 bg-white p-5 shadow-sm">
        <h1 className="text-base font-semibold text-racing-900">
          You&rsquo;ve made {RATING_GATE_THRESHOLD} improvements with Lipi 🎉
        </h1>

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
      </section>
    </div>
  )
}
