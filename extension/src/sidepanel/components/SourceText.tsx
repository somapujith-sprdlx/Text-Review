import { useLayoutEffect, useRef, useState } from 'react'

interface Props {
  text: string
  onChange: (text: string) => void
  // True when the text came from a page selection: shown as a compact quote
  // that can be edited on demand. False for pasted/typed text: always a field.
  fromSelection: boolean
  // Called when the user finishes editing (Done / Ctrl+Enter) with changes.
  onCommit: () => void
}

function AutoGrowTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoFocus,
  minRows = 3,
  label,
}: {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  autoFocus?: boolean
  minRows?: number
  label: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={minRows}
      autoFocus={autoFocus}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className="block w-full resize-none rounded-xl border border-racing-900/10 bg-white p-3 text-sm leading-relaxed text-racing-950 shadow-sm placeholder:text-racing-800/50 focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass"
    />
  )
}

export function SourceText({ text, onChange, fromSelection, onCommit }: Props) {
  const [editing, setEditing] = useState(false)
  const startText = useRef(text)

  function finishEditing() {
    setEditing(false)
    if (text !== startText.current && text.trim()) onCommit()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (fromSelection) finishEditing()
      else onCommit()
    }
  }

  if (!fromSelection) {
    return (
      <div>
        <AutoGrowTextarea
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Paste or type text here…"
          minRows={5}
          label="Text to improve"
        />
        {!text.trim() && (
          <p className="mt-2 text-xs leading-relaxed text-racing-800/75">
            Or select text on any page and click <span className="font-semibold">Improve Text</span> — it shows up
            here automatically.
          </p>
        )}
      </div>
    )
  }

  if (editing) {
    return (
      <div>
        <AutoGrowTextarea value={text} onChange={onChange} onKeyDown={onKeyDown} autoFocus label="Original text" />
        <div className="mt-2 text-right">
          <button
            type="button"
            onClick={finishEditing}
            className="rounded-md px-2 py-1 text-xs font-semibold text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-racing-900/10 bg-white/70 px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-racing-800/75">Original</span>
        <button
          type="button"
          onClick={() => {
            startText.current = text
            setEditing(true)
          }}
          className="rounded-md px-1.5 py-0.5 text-xs font-medium text-racing-800 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          Edit
        </button>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-racing-950/80">{text}</p>
    </div>
  )
}
