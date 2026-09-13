import { useEffect, useState } from 'react'
import { fetchStyles, improveText } from '../services/api.js'
import { replaceActiveFieldText } from '../services/insertText.js'
import type { QuickModeSettings, StyleOption } from '../types/index.js'
import { StyleButton } from './components/StyleButton.js'
import { ResultPanel } from './components/ResultPanel.js'
import { ActionBar } from './components/ActionBar.js'

type Action = 'generate' | 'regenerate' | null

export function App() {
  const [originalText, setOriginalText] = useState('')
  const [editableText, setEditableText] = useState('')
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string>('improve')
  const [customInstruction, setCustomInstruction] = useState('')
  const [outputText, setOutputText] = useState('')
  const [activeAction, setActiveAction] = useState<Action>(null)
  const [error, setError] = useState<string | null>(null)
  const [quickMode, setQuickMode] = useState<QuickModeSettings>({ enabled: false, styleId: 'improve' })
  const loading = activeAction !== null

  useEffect(() => {
    fetchStyles()
      .then(setStyles)
      .catch(() => setError('Something went wrong. Try again.'))

    chrome.storage.session.get('pendingSelection').then((result) => {
      const text = typeof result.pendingSelection === 'string' ? result.pendingSelection : ''
      if (text) {
        setOriginalText(text)
        setEditableText(text)
      }
    })

    // The panel can finish opening before the service worker's storage
    // write for this selection lands, so also listen for it arriving late.
    function handleStorageChange(
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) {
      if (areaName !== 'session') return
      const change = changes.pendingSelection
      if (typeof change?.newValue === 'string') {
        setOriginalText(change.newValue)
        setEditableText(change.newValue)
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)

    chrome.storage.local.get('quickMode').then((result) => {
      const saved = result.quickMode as QuickModeSettings | undefined
      if (saved) setQuickMode(saved)
    })

    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  function updateQuickMode(next: QuickModeSettings) {
    setQuickMode(next)
    chrome.storage.local.set({ quickMode: next })
  }

  async function handleGenerate() {
    setActiveAction('generate')
    setError(null)
    try {
      const result = await improveText({
        text: editableText,
        style: selectedStyle,
        customInstruction: selectedStyle === 'custom' ? customInstruction : undefined,
      })
      setOutputText(result.outputText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setActiveAction(null)
    }
  }

  async function handleRegenerate() {
    setActiveAction('regenerate')
    setError(null)
    try {
      const result = await improveText({
        text: outputText,
        style: selectedStyle,
        customInstruction: selectedStyle === 'custom' ? customInstruction : undefined,
      })
      setOutputText(result.outputText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setActiveAction(null)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(outputText)
  }

  function handleInsert() {
    navigator.clipboard.writeText(outputText)
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: replaceActiveFieldText,
        args: [outputText],
      })
    })
  }

  function handleRestore() {
    setEditableText(originalText)
    setOutputText('')
    setError(null)
  }

  return (
    <div className="min-h-screen bg-racing-50 p-4 max-w-md mx-auto">
      <div className="flex items-baseline justify-between mb-4 pb-3 border-b-2 border-racing-900">
        <h1 className="text-base font-bold tracking-tight text-racing-900">Text Enhancer</h1>
        <span className="font-mono text-[10px] tracking-widest uppercase text-brass">On Track</span>
      </div>

      <label className="block font-mono text-[10px] tracking-widest uppercase text-racing-800/70 mb-1.5">
        Selected Text
      </label>
      <textarea
        className="w-full min-h-[80px] rounded border border-racing-900/15 bg-white p-2.5 text-sm text-racing-950 focus:outline-none focus:ring-2 focus:ring-brass focus:border-brass mb-4"
        value={editableText}
        onChange={(e) => setEditableText(e.target.value)}
      />

      <label className="block font-mono text-[10px] tracking-widest uppercase text-racing-800/70 mb-1.5">
        Quick Styles
      </label>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {styles.map((s) => (
          <StyleButton key={s.id} style={s} active={selectedStyle === s.id} onSelect={setSelectedStyle} />
        ))}
      </div>

      {selectedStyle === 'custom' && (
        <input
          className="w-full rounded border border-racing-900/15 bg-white p-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brass focus:border-brass"
          placeholder="e.g. Make this sound like a LinkedIn post"
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
        />
      )}

      <button
        onClick={handleGenerate}
        disabled={loading || editableText.trim().length === 0}
        className="w-full py-2.5 rounded bg-racing-900 text-racing-50 text-sm font-semibold tracking-wide hover:bg-racing-800 active:bg-racing-950 transition-colors disabled:opacity-40 disabled:hover:bg-racing-900 mb-4 focus:outline-none focus:ring-2 focus:ring-brass focus:ring-offset-2 focus:ring-offset-racing-50"
      >
        {activeAction === 'generate' ? 'Improving your text…' : 'Generate'}
      </button>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{error}</p>
      )}

      {outputText && <ResultPanel outputText={outputText} onEdit={setOutputText} />}

      <ActionBar
        hasResult={outputText.length > 0}
        regenerating={activeAction === 'regenerate'}
        onCopy={handleCopy}
        onInsert={handleInsert}
        onRegenerate={handleRegenerate}
        onRestore={handleRestore}
      />

      <div className="mt-5 pt-4 border-t border-racing-900/15">
        <div className="flex items-center justify-between mb-2">
          <label className="font-mono text-[10px] tracking-widest uppercase text-racing-800/70">
            Quick Mode
          </label>
          <button
            role="switch"
            aria-checked={quickMode.enabled}
            onClick={() => updateQuickMode({ ...quickMode, enabled: !quickMode.enabled })}
            className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brass ${
              quickMode.enabled ? 'bg-racing-900' : 'bg-racing-900/20'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-brass transition-transform ${
                quickMode.enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-racing-800/60 mb-2">
          When on, selecting text and clicking Improve applies your chosen style instantly and
          replaces it in place — no panel needed.
        </p>
        {quickMode.enabled && (
          <div className="flex flex-wrap gap-1.5">
            {styles
              .filter((s) => s.id !== 'custom')
              .map((s) => (
                <StyleButton
                  key={s.id}
                  style={s}
                  active={quickMode.styleId === s.id}
                  onSelect={(id) => updateQuickMode({ ...quickMode, styleId: id })}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
