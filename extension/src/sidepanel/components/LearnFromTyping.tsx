import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  addDisabledHost,
  clearLearnedSamples,
  deleteLearnedSample,
  getLearnedSamples,
  getLearningSettings,
  removeDisabledHost,
  setLearningEnabled,
  DEFAULT_LEARNING_SETTINGS,
  type LearnedSample,
  type LearningSettings,
} from '../../services/typingStore.js'

// Keep in sync with the storage keys owned by services/typingStore.ts; the UI
// only uses them to know *when* to re-read, never to parse the raw values.
const WATCHED_KEYS = ['learningSettings', 'learnedSamples']

// Samples are shown with quirks intact (casing, stretched letters, emoji) but
// long ones are cut so the list stays scannable.
const PREVIEW_LENGTH = 160

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brass'

function preview(text: string): string {
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text
}

// "Delete all" with an inline confirmation instead of a native confirm().
function DeleteAll({ count, onConfirm }: { count: number; onConfirm: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)

  if (count === 0) return null

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`rounded text-xs font-medium text-red-700 underline-offset-2 hover:underline ${FOCUS_RING}`}
      >
        Delete all
      </button>
    )
  }

  return (
    <div role="alertdialog" aria-label="Confirm delete all" className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-xs leading-relaxed text-red-900">
        Delete all {count} learned {count === 1 ? 'message' : 'messages'} from this device? This can&rsquo;t be undone.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={working}
          onClick={async () => {
            setWorking(true)
            await onConfirm()
            setWorking(false)
            setConfirming(false)
          }}
          className={`rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 ${FOCUS_RING}`}
        >
          {working ? 'Deleting…' : 'Delete all'}
        </button>
        <button
          type="button"
          disabled={working}
          onClick={() => setConfirming(false)}
          className={`rounded-lg border border-racing-900/20 px-3 py-1.5 text-xs font-medium text-racing-900 hover:bg-racing-100 disabled:opacity-50 ${FOCUS_RING}`}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function LearnFromTyping() {
  // null until the first read resolves.
  const [settings, setSettings] = useState<LearningSettings | null>(null)
  const [samples, setSamples] = useState<LearnedSample[]>([])
  const [consenting, setConsenting] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [turnedOff, setTurnedOff] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hostInput, setHostInput] = useState('')
  const [hostHint, setHostHint] = useState<string | null>(null)
  const mounted = useRef(true)
  const consentRef = useRef<HTMLDivElement>(null)

  // Best-effort read of both stores; never throws, never leaves the card on
  // the loading state forever.
  const refresh = useCallback(async () => {
    let nextSettings: LearningSettings = DEFAULT_LEARNING_SETTINGS
    let nextSamples: LearnedSample[] = []
    try {
      nextSettings = await getLearningSettings()
    } catch {
      // keep defaults
    }
    try {
      nextSamples = await getLearnedSamples()
    } catch {
      // keep empty
    }
    if (!mounted.current) return
    setSettings(nextSettings)
    // Newest first, without mutating what the store handed back.
    setSamples([...nextSamples].sort((a, b) => b.at - a.at))
  }, [])

  useEffect(() => {
    mounted.current = true
    void refresh()

    // Live updates: the content script writes new samples while the panel is
    // open, and other panels/tabs may change settings. Re-read through the
    // store so its normalisation/validation stays the single source of truth.
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return
      if (WATCHED_KEYS.some((k) => k in changes)) void refresh()
    }
    let listening = false
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener(onChanged)
        listening = true
      }
    } catch {
      // not in an extension context; the card still works without live updates
    }
    return () => {
      mounted.current = false
      if (listening) {
        try {
          chrome.storage.onChanged.removeListener(onChanged)
        } catch {
          // ignore
        }
      }
    }
  }, [refresh])

  useEffect(() => {
    if (consenting) consentRef.current?.focus()
  }, [consenting])

  const enabled = settings?.enabled ?? false
  const loading = settings === null
  const disabledHosts = settings?.disabledHosts ?? []

  async function run(action: () => Promise<LearningSettings | void>) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (mounted.current && result) setSettings(result)
    } catch {
      if (mounted.current) setError('Something went wrong. Try again.')
    }
    if (mounted.current) setBusy(false)
    // Reconcile with storage in case the call resolved with stub/stale data.
    void refresh()
  }

  function handleToggle() {
    if (loading || busy) return
    if (enabled) {
      setConsenting(false)
      setTurnedOff(true)
      void run(() => setLearningEnabled(false))
      return
    }
    // Turning on always goes through the consent card.
    setTurnedOff(false)
    setConsenting((open) => !open)
  }

  function confirmOn() {
    setConsenting(false)
    setTurnedOff(false)
    void run(() => setLearningEnabled(true))
  }

  async function handleAddHost(e: FormEvent) {
    e.preventDefault()
    const raw = hostInput.trim()
    if (raw === '' || busy) return
    setHostHint(null)
    setBusy(true)
    setError(null)
    try {
      const before = disabledHosts
      const next = await addDisabledHost(raw)
      if (!mounted.current) return
      setSettings(next)
      const grew = next.disabledHosts.length > before.length
      if (grew) {
        setHostInput('')
      } else {
        setHostHint("That doesn't look like a site name, or it's already in the list.")
      }
    } catch {
      if (mounted.current) setError('Something went wrong. Try again.')
    }
    if (mounted.current) setBusy(false)
    void refresh()
  }

  async function handleDeleteAll() {
    try {
      await clearLearnedSamples()
    } catch {
      if (mounted.current) setError('Couldn’t delete. Try again.')
    }
    void refresh()
  }

  const count = samples.length

  return (
    <section className="rounded-xl border border-racing-900/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="learn-title" className="text-sm font-semibold text-racing-900">
            Learn from what I type
          </h2>
          <p id="learn-desc" className="mt-1 text-xs leading-relaxed text-racing-800/80">
            Lipi picks up how you text &mdash; your spelling, slang and emoji &mdash; so replies sound like you.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="learn-title"
          aria-describedby="learn-desc"
          disabled={loading || busy}
          onClick={handleToggle}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${FOCUS_RING} ${
            enabled ? 'bg-racing-900' : 'bg-racing-900/20'
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {loading && (
        <p role="status" className="mt-3 text-xs text-racing-800/60">
          Loading&hellip;
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      )}

      {consenting && !enabled && (
        <div
          ref={consentRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="learn-consent-title"
          className="mt-3 rounded-lg border border-brass/60 bg-racing-50 p-3 focus:outline-none"
        >
          <h3 id="learn-consent-title" className="text-xs font-semibold text-racing-900">
            Before you turn this on
          </h3>
          <dl className="mt-2 space-y-2 text-xs leading-relaxed text-racing-800/90">
            <div>
              <dt className="font-semibold text-racing-900">What Lipi reads</dt>
              <dd>
                Finished messages you type into text boxes on websites. Never passwords, payment, one-time-code or
                other sensitive fields. Not in Incognito, and not on banking, health, government or login pages.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-racing-900">Where it lives</dt>
              <dd>Stored only on this device. Never uploaded in bulk.</dd>
            </div>
            <div>
              <dt className="font-semibold text-racing-900">What leaves your device</dt>
              <dd>
                When you tap Reply, a few of these messages are sent with that request to Lipi&rsquo;s server and Groq
                to write your reply. They are not stored there.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-racing-900">You&rsquo;re in control</dt>
              <dd>You can turn this off or delete everything any time, right here.</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={confirmOn}
              disabled={busy}
              className={`rounded-lg bg-racing-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-racing-800 disabled:opacity-50 ${FOCUS_RING}`}
            >
              Turn on
            </button>
            <button
              type="button"
              onClick={() => setConsenting(false)}
              className={`rounded-lg border border-racing-900/20 px-3 py-1.5 text-sm font-medium text-racing-900 hover:bg-racing-100 ${FOCUS_RING}`}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {!loading && enabled && (
        <div className="mt-3 space-y-3 border-t border-racing-900/10 pt-3">
          <p role="status" aria-live="polite" className="text-xs font-medium text-racing-900">
            {count === 1 ? '1 message learned on this device' : `${count} messages learned on this device`}
          </p>

          <div>
            <button
              type="button"
              aria-expanded={listOpen}
              aria-controls="learn-list"
              onClick={() => setListOpen((o) => !o)}
              className={`rounded text-xs font-medium text-racing-800 underline-offset-2 hover:underline ${FOCUS_RING}`}
            >
              {listOpen ? 'Hide what’s been learned' : 'See what’s been learned'}
            </button>

            {listOpen && (
              <div id="learn-list" className="mt-2">
                {count === 0 ? (
                  <p className="text-xs leading-relaxed text-racing-800/70">
                    Nothing learned yet. As you send messages on websites, they&rsquo;ll show up here.
                  </p>
                ) : (
                  <ul className="max-h-64 divide-y divide-racing-900/10 overflow-y-auto rounded-lg border border-racing-900/10">
                    {samples.map((s) => (
                      <li key={s.id} className="flex items-start gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap break-words text-xs text-racing-950">{preview(s.text)}</p>
                          <p className="mt-0.5 truncate text-[11px] text-racing-800/60">{s.host}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete learned message: ${preview(s.text).slice(0, 40)}`}
                          onClick={() => {
                            void (async () => {
                              try {
                                await deleteLearnedSample(s.id)
                              } catch {
                                // best-effort; refresh shows the truth
                              }
                              void refresh()
                            })()
                          }}
                          className={`-mr-1 shrink-0 rounded p-1 text-base leading-none text-racing-800/70 hover:bg-racing-100 hover:text-red-700 ${FOCUS_RING}`}
                        >
                          <span aria-hidden="true">&times;</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DeleteAll count={count} onConfirm={handleDeleteAll} />

          <div className="border-t border-racing-900/10 pt-3">
            <form onSubmit={(e) => void handleAddHost(e)}>
              <label htmlFor="learn-host" className="text-xs font-medium text-racing-900">
                Don&rsquo;t learn on&hellip;
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="learn-host"
                  type="text"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={hostInput}
                  onChange={(e) => {
                    setHostInput(e.target.value)
                    setHostHint(null)
                  }}
                  placeholder="e.g. mail.google.com"
                  aria-describedby="learn-host-help"
                  className="min-w-0 flex-1 rounded-lg border border-racing-900/15 bg-white px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass"
                />
                <button
                  type="submit"
                  disabled={busy || hostInput.trim() === ''}
                  className={`rounded-lg border border-racing-900/20 px-3 py-1.5 text-sm font-medium text-racing-900 hover:bg-racing-100 disabled:opacity-40 ${FOCUS_RING}`}
                >
                  Add
                </button>
              </div>
              <p id="learn-host-help" className="mt-1 text-xs leading-relaxed text-racing-800/80">
                Lipi won&rsquo;t learn from text boxes on these sites.
              </p>
              {hostHint && (
                <p role="status" className="mt-1 text-xs text-amber-800">
                  {hostHint}
                </p>
              )}
            </form>

            {disabledHosts.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sites Lipi won't learn on">
                {disabledHosts.map((host) => (
                  <li
                    key={host}
                    className="flex max-w-full items-center gap-1 rounded-full border border-racing-900/15 bg-racing-50 py-0.5 pl-2.5 pr-1 text-xs text-racing-900"
                  >
                    <span className="truncate">{host}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${host}`}
                      disabled={busy}
                      onClick={() => void run(() => removeDisabledHost(host))}
                      className={`shrink-0 rounded-full px-1.5 text-sm leading-none text-racing-800/70 hover:bg-racing-100 hover:text-red-700 disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!loading && !enabled && !consenting && (turnedOff || count > 0) && (
        <div className="mt-3 space-y-2 border-t border-racing-900/10 pt-3">
          <p role="status" className="text-xs leading-relaxed text-racing-800/80">
            {count > 0
              ? 'Learning is off. Existing learned messages are kept until you delete them.'
              : 'Learning is off.'}
          </p>
          <DeleteAll count={count} onConfirm={handleDeleteAll} />
        </div>
      )}
    </section>
  )
}
