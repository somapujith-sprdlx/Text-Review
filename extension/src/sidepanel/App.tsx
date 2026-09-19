import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compareFigures } from '../../../shared/figures.js'
import { improveText } from '../services/api.js'
import { InvalidKeyError, LimitReachedError } from '../services/errors.js'
import { replaceSelectionText } from '../services/insertText.js'
import { clearGroqKey } from '../services/keyStore.js'
import { PRIMARY_STYLE_IDS, isWriterRole, type WriterRole } from '../services/roles.js'
import type { QuickModeSettings } from '../types/index.js'
import { GearIcon } from './components/Icons.js'
import { KeySetup, type KeyPromptReason } from './components/KeySetup.js'
import { ResultCard, ResultSkeleton } from './components/ResultCard.js'
import { Settings } from './components/Settings.js'
import { SourceText } from './components/SourceText.js'
import { StylePicker } from './components/StylePicker.js'

const GENERIC_ERROR = 'Something went wrong. Try again.'
const DEFAULT_QUICK_MODE: QuickModeSettings = { enabled: false, styleId: 'improve' }

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
  const [role, setRole] = useState<WriterRole>('general')
  // The text the result was generated from, for the figure check.
  const [sourceForResult, setSourceForResult] = useState('')

  // Only the latest request may write results — a slow response for an
  // earlier style must not overwrite the one the user just switched to.
  const requestId = useRef(0)
  const quickModeRef = useRef(quickMode)
  quickModeRef.current = quickMode
  const settingsReady = useRef(false)
  const queuedSelection = useRef<string | null>(null)
  const lastSelection = useRef({ text: '', at: 0 })
  // What was selected on the page, so Replace can swap exactly that text.
  const pageSelection = useRef('')

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
      if (id === requestId.current) setResult(res.outputText)
    } catch (err) {
      if (id !== requestId.current) return
      if (err instanceof LimitReachedError) setKeyPrompt('limit')
      else if (err instanceof InvalidKeyError) setKeyPrompt('invalid')
      else setError(err instanceof Error ? err.message : GENERIC_ERROR)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  // A new page selection replaces whatever is on screen and is improved right
  // away in the default style — that's the whole point of selecting it.
  const takeSelection = useCallback(
    (incoming: string) => {
      // The mount-time read and the storage-change event can both deliver the
      // same selection; only act on it once.
      const now = Date.now()
      if (incoming === lastSelection.current.text && now - lastSelection.current.at < 1500) return
      lastSelection.current = { text: incoming, at: now }

      // Consume it, so reopening the panel later doesn't replay a stale selection.
      chrome.storage.session.remove('pendingSelection')

      const style = quickModeRef.current.styleId
      pageSelection.current = incoming
      setView('main')
      setText(incoming)
      setFromSelection(true)
      setStyleId(style)
      setCustomInstruction('')
      void run(incoming, style, '')
    },
    [run],
  )

  useEffect(() => {
    let cancelled = false

    Promise.all([
      chrome.storage.local.get(['quickMode', 'groqApiKey', 'writerRole']),
      chrome.storage.session.get('pendingSelection'),
    ]).then(([local, session]) => {
      if (cancelled) return
      const saved = local.quickMode as QuickModeSettings | undefined
      if (saved) {
        setQuickMode(saved)
        quickModeRef.current = saved
        setStyleId(saved.styleId)
      }
      setSavedKey(typeof local.groqApiKey === 'string' ? local.groqApiKey : null)
      if (isWriterRole(local.writerRole)) setRole(local.writerRole)

      settingsReady.current = true
      const pending = typeof session.pendingSelection === 'string' ? session.pendingSelection : ''
      const incoming = pending || queuedSelection.current
      queuedSelection.current = null
      if (incoming) takeSelection(incoming)
    })

    // The panel can finish opening before the service worker's storage write
    // for this selection lands, so also listen for it arriving late (and for
    // every later selection while the panel stays open).
    function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }, area: string) {
      if (area === 'session') {
        const incoming = changes.pendingSelection?.newValue
        if (typeof incoming === 'string' && incoming) {
          if (settingsReady.current) takeSelection(incoming)
          else queuedSelection.current = incoming
        }
      }
      if (area === 'local' && changes.groqApiKey) {
        const next = changes.groqApiKey.newValue
        setSavedKey(typeof next === 'string' ? next : null)
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      cancelled = true
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [takeSelection])

  function updateQuickMode(next: QuickModeSettings) {
    setQuickMode(next)
    chrome.storage.local.set({ quickMode: next })
  }

  function updateRole(next: WriterRole) {
    setRole(next)
    chrome.storage.local.set({ writerRole: next })
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

  if (view === 'settings') {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-racing-50 px-4 pb-8 pt-4 text-racing-950">
        <Settings
          role={role}
          onRoleChange={updateRole}
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
        <h1 className="text-base font-semibold tracking-tight text-racing-900">Text Enhancer</h1>
        <div className="flex items-center gap-1.5">
          <span
            title={savedKey ? 'Requests use your own Groq key' : 'Using the free allowance'}
            className="rounded-full bg-racing-900/10 px-2 py-0.5 text-[11px] font-medium text-racing-800"
          >
            {savedKey ? 'Your Groq key' : 'Free'}
          </span>
          <button
            type="button"
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
        <SourceText
          text={text}
          onChange={setText}
          fromSelection={fromSelection}
          onCommit={submit}
        />

        {hasText && (
          <StylePicker
            value={styleId}
            primaryIds={PRIMARY_STYLE_IDS[role]}
            onPick={pickStyle}
            customInstruction={customInstruction}
            onCustomChange={setCustomInstruction}
            onCustomApply={submit}
          />
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
        )}
      </main>
    </div>
  )
}
