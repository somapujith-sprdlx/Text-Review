import type { StyleOption } from '../../types/index.js'

interface Props {
  style: StyleOption
  active: boolean
  onSelect: (id: string) => void
}

export function StyleButton({ style, active, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(style.id)}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
      title={style.description}
    >
      {style.label}
    </button>
  )
}
