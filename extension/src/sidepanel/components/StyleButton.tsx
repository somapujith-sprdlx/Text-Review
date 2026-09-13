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
      className={`px-3 py-1.5 rounded text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-brass ${
        active
          ? 'bg-racing-900 text-racing-50 border-brass'
          : 'bg-white text-racing-900 border-transparent hover:bg-racing-100'
      }`}
      title={style.description}
    >
      {style.label}
    </button>
  )
}
