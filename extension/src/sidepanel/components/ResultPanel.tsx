interface Props {
  outputText: string
  onEdit: (value: string) => void
}

export function ResultPanel({ outputText, onEdit }: Props) {
  return (
    <div className="mb-4">
      <label className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase text-brass mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-brass" />
        Improved Text
      </label>
      <textarea
        className="w-full min-h-[120px] rounded border-2 border-racing-900 bg-white p-2.5 text-sm text-racing-950 focus:outline-none focus:ring-2 focus:ring-brass"
        value={outputText}
        onChange={(e) => onEdit(e.target.value)}
      />
    </div>
  )
}
