import { useState } from 'react'
import { validateGroqKey } from '../../services/groq.js'
import { looksLikeGroqKey, saveGroqKey } from '../../services/keyStore.js'
import { ExternalIcon, KeyIcon } from './Icons.js'

export type KeyPromptReason = 'limit' | 'invalid' | 'settings'

interface Props {
  reason: KeyPromptReason
  onSaved: (key: string) => void
  onCancel?: () => void
}

const COPY: Record<KeyPromptReason, { title: string; body: string }> = {
  limit: {
    title: "You've reached your limit for today",
    body: 'Add your own free Groq key to keep improving text today — with no daily limit. It takes about a minute.',
  },
  invalid: {
    title: 'Groq key rejected',
    body: 'Groq did not accept your saved key. It may have been revoked — paste a new one below.',
  },
  settings: {
    title: 'Use your own Groq key',
    body: "Requests go straight to Groq with your own key, so you're never held back by the free allowance.",
  },
}

const GROQ_KEYS_URL = 'https://console.groq.com/keys'

export function KeySetup({ reason, onSaved, onCancel }: Props) {
  const [value, setValue] = useState('')
  const [reveal, setReveal] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { title, body } = COPY[reason]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const key = value.trim()
    if (!looksLikeGroqKey(key)) {
      setError('That doesn’t look like a Groq key — it should start with “gsk_”.')
      return
    }

    setChecking(true)
    setError(null)
    try {
      if (!(await validateGroqKey(key))) {
        setError('Groq rejected this key. Make sure you copied all of it.')
        return
      }
      await saveGroqKey(key)
      onSaved(key)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-brass/60 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass/20 text-racing-900">
          <KeyIcon />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-racing-900">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-racing-800/85">{body}</p>
        </div>
      </div>

      <ol className="mt-4 space-y-3 text-sm text-racing-950">
        <li className="flex gap-3">
          <StepNumber n={1} />
          <div className="flex-1">
            <p>Sign in to Groq and open <span className="font-medium">API Keys</span>.</p>
            <a
              href={GROQ_KEYS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-racing-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2"
            >
              Open Groq Console <ExternalIcon />
            </a>
          </div>
        </li>
        <li className="flex gap-3">
          <StepNumber n={2} />
          <p>
            Click <span className="font-medium">Create API Key</span>, name it anything, and copy the key.
          </p>
        </li>
        <li className="flex gap-3">
          <StepNumber n={3} />
          <form onSubmit={handleSubmit} className="flex-1">
            <label htmlFor="groq-key" className="mb-1.5 block">
              Paste it here
            </label>
            <div className="flex gap-2">
              <input
                id="groq-key"
                type={reveal ? 'text' : 'password'}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setError(null)
                }}
                placeholder="gsk_…"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error !== null}
                aria-describedby={error ? 'groq-key-error' : undefined}
                className="min-w-0 flex-1 rounded-lg border border-racing-900/15 bg-white px-3 py-2 font-mono text-xs focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="rounded-lg px-2 text-xs font-medium text-racing-800 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
            {error && (
              <p id="groq-key-error" role="alert" className="mt-2 text-xs text-red-700">
                {error}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={checking || value.trim().length === 0}
                className="rounded-lg bg-brass px-3.5 py-2 text-sm font-semibold text-racing-950 hover:bg-brass-light focus:outline-none focus-visible:ring-2 focus-visible:ring-racing-900 disabled:opacity-50"
              >
                {checking ? 'Checking key…' : reason === 'settings' ? 'Save key' : 'Save & continue'}
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg px-2.5 py-2 text-sm font-medium text-racing-800 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </li>
      </ol>

      <p className="mt-4 border-t border-racing-900/10 pt-3 text-xs leading-relaxed text-racing-800/75">
        Your key is stored only in this browser. Text goes directly from your browser to Groq — never through our server.
      </p>
    </section>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-racing-900 text-[11px] font-semibold text-white"
    >
      {n}
    </span>
  )
}
