import { useState } from 'react'
import { linkGoogleAccount } from '../../services/deviceState.js'
import type { DeviceState } from '../../types/index.js'

interface Props {
  onSignedIn: (state: DeviceState) => void
}

// Compulsory, full-panel sign-in shown before anything else (including the
// guided tour and the rating gate). There is deliberately no skip/bypass:
// the Google account is what ties the improvement count to a person instead
// of the resettable, per-install device id.
export function SignInGate({ onSignedIn }: Props) {
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    setSigningIn(true)
    setError(null)
    const state = await linkGoogleAccount(true)
    setSigningIn(false)
    if (state) onSignedIn(state)
    else setError('Something went wrong signing in. Try again.')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-racing-50 px-4 py-8 text-racing-950">
      <section className="rounded-xl border border-brass/60 bg-white p-5 shadow-sm">
        <h1 className="text-base font-semibold text-racing-900">Sign in to start using Lipi</h1>

        <p className="mt-2 text-sm leading-relaxed text-racing-800/85">
          Sign in with your Google account to get going. It only takes a moment.
        </p>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="mt-4 w-full rounded-lg bg-racing-900 py-2.5 text-sm font-semibold text-white hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-racing-50 disabled:opacity-50"
        >
          {signingIn ? 'Signing in…' : 'Sign in with Google'}
        </button>

        {error && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <p className="mt-4 border-t border-racing-900/10 pt-3 text-xs leading-relaxed text-racing-800/70">
          Your Google account is only used to identify you and keep your progress if you ever reinstall Lipi. Nothing
          is posted or shared.
        </p>
      </section>
    </div>
  )
}
