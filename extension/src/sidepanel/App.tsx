import { useEffect, useState } from 'react'
import { fetchStyles, improveText } from '../services/api.js'
import type { StyleOption } from '../types/index.js'
import { StyleButton } from './components/StyleButton.js'
import { ResultPanel } from './components/ResultPanel.js'
import { ActionBar } from './components/ActionBar.js'

export function App() {
  const [originalText, setOriginalText] = useState('')
  const [editableText, setEditableText] = useState('')
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string>('improve')
  const [customInstruction, setCustomInstruction] = useState('')
  const [outputText, setOutputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStyles()
      .then(setStyles)
      .catch(() => setError('Something went wrong. Try again.'))

    chrome.storage.session.get('pendingSelection').then((result) => {
      const text = typeof result.pendingSelection === 'string' ? result.pendingSelection : ''
      setOriginalText(text)
      setEditableText(text)
    })
  }, [])

  async function runImprove() {
    setLoading(true)
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
      setLoading(false)
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
        func: (text: string) => {
          const active = document.activeElement as HTMLElement | null
          if (
            active &&
            (active.tagName === 'TEXTAREA' ||
              (active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'text'))
          ) {
            ;(active as HTMLTextAreaElement | HTMLInputElement).value = text
            active.dispatchEvent(new Event('input', { bubbles: true }))
            return
          }
          if (active && active.isContentEditable) {
            active.textContent = text
            active.dispatchEvent(new Event('input', { bubbles: true }))
            return
          }
          navigator.clipboard.writeText(text)
        },
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
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-lg font-semibold mb-3">✨ Text Enhancer</h1>

      <label className="block text-xs font-medium text-gray-500 mb-1">Selected Text</label>
      <textarea
        className="w-full min-h-[80px] rounded-md border border-gray-300 p-2 text-sm mb-3"
        value={editableText}
        onChange={(e) => setEditableText(e.target.value)}
      />

      <label className="block text-xs font-medium text-gray-500 mb-1">Quick Styles</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {styles.map((s) => (
          <StyleButton key={s.id} style={s} active={selectedStyle === s.id} onSelect={setSelectedStyle} />
        ))}
      </div>

      {selectedStyle === 'custom' && (
        <input
          className="w-full rounded-md border border-gray-300 p-2 text-sm mb-3"
          placeholder="e.g. Make this sound like a LinkedIn post"
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
        />
      )}

      <button
        onClick={runImprove}
        disabled={loading || editableText.trim().length === 0}
        className="w-full py-2 rounded-md bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 mb-3"
      >
        {loading ? 'Improving your text...' : 'Generate'}
      </button>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {outputText && <ResultPanel outputText={outputText} onEdit={setOutputText} />}

      <ActionBar
        hasResult={outputText.length > 0}
        onCopy={handleCopy}
        onInsert={handleInsert}
        onRegenerate={runImprove}
        onRestore={handleRestore}
      />
    </div>
  )
}
