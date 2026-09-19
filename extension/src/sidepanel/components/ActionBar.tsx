interface Props {
  hasResult: boolean
  regenerating: boolean
  onCopy: () => void
  onInsert: () => void
  onRegenerate: () => void
  onRestore: () => void
}

export function ActionBar({ hasResult, regenerating, onCopy, onInsert, onRegenerate, onRestore }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        disabled={!hasResult}
        onClick={onCopy}
        className="px-3 py-2 rounded bg-racing-950 text-racing-50 text-sm font-medium hover:bg-racing-900 transition-colors disabled:opacity-40 disabled:hover:bg-racing-950 focus:outline-none focus:ring-2 focus:ring-brass"
      >
        Copy
      </button>
      <button
        disabled={!hasResult}
        onClick={onInsert}
        className="px-3 py-2 rounded bg-brass text-racing-950 text-sm font-semibold hover:bg-brass-light transition-colors disabled:opacity-40 disabled:hover:bg-brass focus:outline-none focus:ring-2 focus:ring-racing-900"
      >
        Insert / Replace
      </button>
      <button
        disabled={!hasResult || regenerating}
        onClick={onRegenerate}
        className="px-3 py-2 rounded border border-racing-900/25 text-racing-900 text-sm font-medium hover:bg-racing-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-brass"
      >
        {regenerating ? 'Regenerating…' : 'Regenerate'}
      </button>
      <button
        onClick={onRestore}
        className="px-3 py-2 rounded border border-racing-900/25 text-racing-900 text-sm font-medium hover:bg-racing-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brass"
      >
        Restore Original
      </button>
    </div>
  )
}
