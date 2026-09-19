import { useState } from 'react'
import { STYLES } from '../../../../shared/styles.js'

interface Props {
  value: string
  // Style ids shown up front, in order; every other style sits under "More".
  primaryIds: readonly string[]
  onPick: (id: string) => void
  customInstruction: string
  onCustomChange: (value: string) => void
  onCustomApply: () => void
}

function Chip({
  label,
  title,
  active,
  onClick,
}: {
  label: string
  title?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass ${
        active
          ? 'bg-racing-900 text-white'
          : 'border border-racing-900/15 bg-white text-racing-900 hover:bg-racing-100'
      }`}
    >
      {label}
    </button>
  )
}

export function StylePicker({ value, primaryIds, onPick, customInstruction, onCustomChange, onCustomApply }: Props) {
  const [expanded, setExpanded] = useState(false)
  const primary = primaryIds.flatMap((id) => STYLES.filter((s) => s.id === id))
  const more = STYLES.filter((s) => !primaryIds.includes(s.id))
  // Keep the extra styles open whenever one of them is the active choice.
  const showMore = expanded || more.some((s) => s.id === value)

  return (
    <section aria-label="Writing style">
      <div className="flex flex-wrap gap-1.5">
        {primary.map((s) => (
          <Chip key={s.id} label={s.label} title={s.description} active={value === s.id} onClick={() => onPick(s.id)} />
        ))}
        {showMore &&
          more.map((s) => (
            <Chip key={s.id} label={s.label} title={s.description} active={value === s.id} onClick={() => onPick(s.id)} />
          ))}
        {!showMore && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-racing-800 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            More
          </button>
        )}
      </div>

      {value === 'custom' && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onCustomApply()
          }}
        >
          <input
            autoFocus
            value={customInstruction}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder="e.g. Make this sound like a LinkedIn post"
            aria-label="Custom instruction"
            className="min-w-0 flex-1 rounded-lg border border-racing-900/15 bg-white px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass"
          />
          <button
            type="submit"
            disabled={customInstruction.trim().length === 0}
            className="rounded-lg bg-racing-900 px-3 py-2 text-sm font-semibold text-white hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:opacity-40"
          >
            Apply
          </button>
        </form>
      )}
    </section>
  )
}
