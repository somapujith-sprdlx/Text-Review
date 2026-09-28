import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compareFigures } from '../../../shared/figures.js'
import { fetchUsage, improveText } from '../services/api.js'
import { completeOnboarding, fetchDeviceState } from '../services/deviceState.js'
import { InvalidKeyError, LimitReachedError } from '../services/errors.js'
import { replaceSelectionText } from '../services/insertText.js'
import { clearGroqKey } from '../services/keyStore.js'
import type { DeviceState, QuickModeSettings, UsageInfo } from '../types/index.js'
import { GearIcon } from './components/Icons.js'
import { KeySetup, type KeyPromptReason } from './components/KeySetup.js'
import { RateGate } from './components/RateGate.js'
import { ResultCard, ResultSkeleton } from './components/ResultCard.js'
import { Settings } from './components/Settings.js'
import { SourceText } from './components/SourceText.js'
import { StylePicker } from './components/StylePicker.js'
import { Tour } from './components/Tour.js'

const GENERIC_ERROR = 'Something went wrong. Try again.'
const DEFAULT_QUICK_MODE: QuickModeSettings = { enabled: true, styleId: 'improve' }
// Canned example used only while the guided tour is active, so the style
// picker and result card have something real to spotlight without spending
// an actual AI request. Restored to whatever was there before once the tour
// ends (see startTour/endTour).
const TOUR_DEMO_TEXT = 'hey can u send that file today'
const TOUR_DEMO_RESULT = 'Could you please send the file today?'

export function App() {
  const [view, setView] = useState<'main' | 'settings'>('main')
  const [text, setText] = useState('')
  const [fromSelection, setFromSelection] = useState(false)
  const [styleId, setStyleId] = useState(DEFAULT_QUICK_MODE.styleId)
  const [customInstruction, setCustomInstruction] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyPrompt, setKeyPrompt] = useState<KeyPromptReason | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [quickMode, setQuickMode] = useState(DEFAULT_QUICK_MODE)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  // Fetched on open (see the mount effect) and refreshed from every
  // backend-routed response after that. Null until the fetch resolves, so
  // the header shows plain "Free" for a moment rather than a guessed count.
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  // The text the result was generated from, for the figure check.
  const [sourceForResult, setSourceForResult] = useState('')
  // Covers both free-tier and BYOK usage (see services/deviceState.ts) —
  // null/false until the mount effect resolves, same "don't guess" reasoning
  // as usage above. onboardingCompleted null = not known yet, so the tour
  // doesn't flash on before we're sure it's actually needed.
  const [ratingRequired, setRatingRequired] = useState(false)
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null)
  const [showTour, setShowTour] = useState(false)

  // Only the latest request may write results — a slow response for an
  // earlier style must not overwrite the one the user just switched to.
  const requestId = useRef(0)
  const quickModeRef = useRef(quickMode)
  quickModeRef.current = quickMode
  const settingsReady = useRef(false)
  const queuedSelection = useRef<string | null>(null)
  const queuedLimitReached = useRef(false)
  const queuedRatingRequired = useRef(false)
  const lastSelection = useRef({ text: '', at: 0 })
  // What was selected on the page, so Replace can swap exactly that text.
  const pageSelection = useRef('')
  // Snapshot of real state taken right before the tour overwrites it with
  // the canned demo, restored when the tour ends.
  const preTourState = useRef<{ text: string; result: string; fromSelection: boolean; sourceForResult: string } | null>(
    null,
  )
  const tourStarted = useRef(false)

  function applyDeviceState(state: DeviceState) {
    setRatingRequired(state.ratingRequired)
    setOnboardingCompleted(state.onboardingCompleted)
  }

  const run = useCallback(async (input: string, style: string, custom: string) => {
    if (!input.trim()) return
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    setKeyPrompt(null)
    setNotice(null)
    setResult('')
    setSourceForResult(input)
    try {
      const res = await improveText({
        text: input,
        style,
        customInstruction: style === 'custom' ? custom : undefined,
      })
      if (id === requestId.current) {
        setResult(res.outputText)
        if (res.usage) setUsage(res.usage)
      }
    } catch (err) {
      if (id !== requestId.current) return
      if (err instanceof LimitReachedError) {
        setKeyPrompt('limit')
        if (err.usage) setUsage(err.usage)
      } else if (err instanceof InvalidKeyError) setKeyPrompt('invalid')
      else setError(err instanceof Error ? err.message : GENERIC_ERROR)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  // A new page selection replaces whatever is on screen and is improved right
  // away in the default style — that's the whole point of selecting it.
  const takeSelection = useCallback(
    (incoming: string, limitReached = false, ratingGateHit = false) => {
      // The mount-time read and the storage-change event can both deliver the
      // same selection; only act on it once.
      const now = Date.now()
      if (incoming === lastSelection.current.text && now - lastSelection.current.at < 1500) return
      lastSelection.current = { text: incoming, at: now }

      // Consume it, so reopening the panel later doesn't replay a stale selection.
      chrome.storage.session.remove(['pendingSelection', 'pendingLimitReached', 'pendingRatingRequired'])

      const style = quickModeRef.current.styleId
      pageSelection.current = incoming
      setView('main')
      setText(incoming)
      setFromSelection(true)
      setStyleId(style)
      setCustomInstruction('')
      if (ratingGateHit) {
        // The background already knows the gate is up — surface RateGate
        // (via the render below) instead of attempting a doomed request.
        setResult('')
        setError(null)
        setNotice(null)
        setRatingRequired(true)
      } else if (limitReached) {
        // The background already knows today's free limit is used up —
        // go straight to the key prompt instead of running (and failing) a request.
        setResult('')
        setError(null)
        setNotice(null)
        setKeyPrompt('limit')
      } else {
        void run(incoming, style, '')
      }
    },
    [run],
  )

  useEffect(() => {
    let cancelled = false

    Promise.all([
      chrome.storage.local.get(['quickMode', 'groqApiKey', 'deviceStateCache']),
      chrome.storage.session.get(['pendingSelection', 'pendingLimitReached', 'pendingRatingRequired']),
    ]).then(([local, session]) => {
      if (cancelled) return
      const saved = local.quickMode as QuickModeSettings | undefined
      if (saved) {
        setQuickMode(saved)
        quickModeRef.current = saved
        setStyleId(saved.styleId)
      }
      const hasOwnKey = typeof local.groqApiKey === 'string' && local.groqApiKey.length > 0
      setSavedKey(hasOwnKey ? (local.groqApiKey as string) : null)
      // Own-key requests never touch the backend, so there's nothing to show.
      if (!hasOwnKey) void fetchUsage().then((info) => { if (!cancelled) setUsage(info) })

      // Cached read first (avoids a flash of the normal UI before we know
      // the gate/tour status), then a fresh fetch to reconcile — same
      // pattern as usage above, applied to device state instead.
      const cachedState = local.deviceStateCache as DeviceState | undefined
      if (cachedState) applyDeviceState(cachedState)
      void fetchDeviceState().then((state) => {
        if (!cancelled && state) applyDeviceState(state)
      })

      settingsReady.current = true
      const pending = typeof session.pendingSelection === 'string' ? session.pendingSelection : ''
      const limitReached = session.pendingLimitReached === true
      const ratingGateHit = session.pendingRatingRequired === true
      const incoming = pending || queuedSelection.current
      const incomingLimitReached = pending ? limitReached : queuedLimitReached.current
      const incomingRatingGateHit = pending ? ratingGateHit : queuedRatingRequired.current
      queuedSelection.current = null
      queuedLimitReached.current = false
      queuedRatingRequired.current = false
      if (incoming) takeSelection(incoming, incomingLimitReached, incomingRatingGateHit)
    })

    // The panel can finish opening before the service worker's storage write
    // for this selection lands, so also listen for it arriving late (and for
    // every later selection while the panel stays open).
    function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }, area: string) {
      if (area === 'session') {
        const incoming = changes.pendingSelection?.newValue
        if (typeof incoming === 'string' && incoming) {
          const limitReached = changes.pendingLimitReached?.newValue === true
          const ratingGateHit = changes.pendingRatingRequired?.newValue === true
          if (settingsReady.current) takeSelection(incoming, limitReached, ratingGateHit)
          else {
            queuedSelection.current = incoming
            queuedLimitReached.current = limitReached
            queuedRatingRequired.current = ratingGateHit
          }
        }
      }
      if (area === 'local' && changes.groqApiKey) {
        const next = changes.groqApiKey.newValue
        setSavedKey(typeof next === 'string' ? next : null)
      }
      // Covers every place device state changes — App.tsx's own fetches
      // below, RateGate's claim, and the fire-and-forget increment inside
      // improveText() (api.ts), including for Quick Mode requests handled
      // entirely in the service worker.
      if (area === 'local' && changes.deviceStateCache) {
        const next = changes.deviceStateCache.newValue as DeviceState | undefined
        if (next) applyDeviceState(next)
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      cancelled = true
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [takeSelection])

  // First panel open after install (onboardingCompleted === false, fetched
  // above) — take over with the guided tour once, using a canned example so
  // every step has something real to spotlight without an AI call.
  useEffect(() => {
    if (onboardingCompleted !== false || tourStarted.current) return
    tourStarted.current = true
    preTourState.current = { text, result, fromSelection, sourceForResult }
    setText(TOUR_DEMO_TEXT)
    setFromSelection(false)
    setResult(TOUR_DEMO_RESULT)
    setSourceForResult(TOUR_DEMO_TEXT)
    setShowTour(true)
    // Deliberately not depending on text/result/etc. — this must only ever
    // run once, gated by tourStarted, not re-run when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingCompleted])

  function endTour() {
    setShowTour(false)
    const prev = preTourState.current
    if (prev) {
      setText(prev.text)
      setResult(prev.result)
      setFromSelection(prev.fromSelection)
      setSourceForResult(prev.sourceForResult)
    }
    preTourState.current = null
    setOnboardingCompleted(true)
    void completeOnboarding().then((state) => {
      if (state) applyDeviceState(state)
    })
  }

  function updateQuickMode(next: QuickModeSettings) {
    setQuickMode(next)
    chrome.storage.local.set({ quickMode: next })
  }

  function submit() {
    if (styleId === 'custom' && !customInstruction.trim()) return
    void run(text, styleId, customInstruction)
  }

  function pickStyle(id: string) {
    setStyleId(id)
    // Custom needs an instruction first; every other style runs on click.
    if (id !== 'custom') void run(text, id, '')
  }

  function handleKeySaved(key: string) {
    setSavedKey(key)
    setUsage(null)
    if (keyPrompt) {
      // The request that hit the limit can now go through — retry it.
      setKeyPrompt(null)
      void run(text, styleId, customInstruction)
    }
  }

  async function handleRemoveKey() {
    await clearGroqKey()
    setSavedKey(null)
  }

  function handleRatingClaimed(state: DeviceState) {
    applyDeviceState(state)
  }

  async function handleReplace() {
    // Always copy too, so nothing is lost if the page has no editable field.
    await navigator.clipboard.writeText(result).catch(() => undefined)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('no active tab')
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: replaceSelectionText,
        args: [result, pageSelection.current],
      })
      setNotice(
        injection?.result === 'replaced'
          ? '✓ Replaced in the page.'
          : "Couldn't edit that text in place, so it was copied — paste it where you need it.",
      )
    } catch {
      setNotice("Couldn't reach this page, so the text was copied instead — paste it where you need it.")
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(result).catch(() => undefined)
    setNotice(null)
  }

  const figures = useMemo(() => compareFigures(sourceForResult, result), [sourceForResult, result])

  // Takes over the whole panel, including Settings — a hard gate, not just
  // a nudge on the main flow. See services/deviceState.ts / RateGate.tsx.
  if (ratingRequired) {
    return <RateGate onClaimed={handleRatingClaimed} />
  }

  if (view === 'settings') {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-racing-50 px-4 pb-8 pt-4 text-racing-950">
        <Settings
          quickMode={quickMode}
          onQuickModeChange={updateQuickMode}
          savedKey={savedKey}
          onRemoveKey={handleRemoveKey}
          onKeySaved={handleKeySaved}
          onBack={() => setView('main')}
        />
      </div>
    )
  }

  const hasText = text.trim().length > 0
  const hasRun = loading || result !== '' || error !== null || keyPrompt !== null

  return (
    <div className="mx-auto min-h-screen max-w-md bg-racing-50 px-4 pb-8 pt-4 text-racing-950">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight text-racing-900">Lipi - Text Enhancer</h1>
        <div className="flex items-center gap-1.5">
          <span
            title={
              savedKey
                ? 'Requests use your own Groq key'
                : usage
                  ? `${Math.max(usage.limit - usage.used, 0)} of ${usage.limit} free requests left today`
                  : 'Using the free allowance'
            }
            className="rounded-full bg-racing-900/10 px-2 py-0.5 text-[11px] font-medium text-racing-800"
          >
            {savedKey ? 'Your Groq key' : usage ? `Free · ${usage.used}/${usage.limit} today` : 'Free'}
          </span>
          <button
            type="button"
            id="tour-settings"
            onClick={() => setView('settings')}
            aria-label="Settings"
            title="Settings"
            className="rounded-lg p-1.5 text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <main className="space-y-4">
        <div id="tour-source-text">
          <SourceText
            text={text}
            onChange={setText}
            fromSelection={fromSelection}
            onCommit={submit}
          />
        </div>

        {hasText && (
          <div id="tour-style-picker">
            <StylePicker
              value={styleId}
              onPick={pickStyle}
              customInstruction={customInstruction}
              onCustomChange={setCustomInstruction}
              onCustomApply={submit}
            />
          </div>
        )}

        {hasText && !hasRun && styleId !== 'custom' && (
          <button
            type="button"
            onClick={submit}
            className="w-full rounded-lg bg-racing-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-racing-50"
          >
            Improve text
          </button>
        )}

        {loading && <ResultSkeleton />}

        {error && !loading && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={submit}
              className="shrink-0 rounded-md px-2 py-1 font-semibold hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              Retry
            </button>
          </div>
        )}

        {keyPrompt && !loading && <KeySetup reason={keyPrompt} onSaved={handleKeySaved} />}

        {result && !loading && (
          <div id="tour-result-card">
            <ResultCard
              result={result}
              notice={notice}
              figures={figures}
              canReplace={fromSelection && pageSelection.current !== ''}
              onChange={(value) => {
                setResult(value)
                setNotice(null)
              }}
              onReplace={handleReplace}
              onCopy={handleCopy}
              onRetry={submit}
            />
          </div>
        )}
      </main>

      {showTour && <Tour onFinish={endTour} />}
    </div>
  )
}
