interface Props {
  hasResult: boolean
  onCopy: () => void
  onInsert: () => void
  onRegenerate: () => void
  onRestore: () => void
}

export function ActionBar({ hasResult, onCopy, onInsert, onRegenerate, onRestore }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      <button
        disabled={!hasResult}
        onClick={onCopy}
        className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm disabled:opacity-40"
      >
        Copy
      </button>
      <button
        disabled={!hasResult}
        onClick={onInsert}
        className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm disabled:opacity-40"
      >
        Insert / Replace
      </button>
      <button
        disabled={!hasResult}
        onClick={onRegenerate}
        className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-40"
      >
        Regenerate
      </button>
      <button onClick={onRestore} className="px-3 py-2 rounded-md border border-gray-300 text-sm">
        Restore Original
      </button>
    </div>
  )
}
