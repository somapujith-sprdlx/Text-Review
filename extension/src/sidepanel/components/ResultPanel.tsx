interface Props {
  outputText: string
  onEdit: (value: string) => void
}

export function ResultPanel({ outputText, onEdit }: Props) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">Improved Text</label>
      <textarea
        className="w-full min-h-[120px] rounded-md border border-gray-300 p-2 text-sm"
        value={outputText}
        onChange={(e) => onEdit(e.target.value)}
      />
    </div>
  )
}
