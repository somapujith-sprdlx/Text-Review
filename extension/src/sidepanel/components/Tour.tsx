import { useLayoutEffect, useState } from 'react'

interface TourStep {
  // null = no spotlight, centered card (used for the intro step, which has
  // no single UI element to point at).
  targetId: string | null
  title: string
  body: string
}

const STEPS: TourStep[] = [
  {
    targetId: null,
    title: 'Quick Mode is on',
    body: 'Clicking Improve Text on any selected text rewrites it in place, automatically — no panel needed. Open this panel any time for more control.',
  },
  {
    targetId: 'tour-source-text',
    title: 'Your text',
    body: 'This is your selected text — you can also type or paste here directly.',
  },
  {
    targetId: 'tour-style-picker',
    title: 'Pick a style',
    body: 'Formal, Casual, Concise, or write your own custom instruction.',
  },
  {
    targetId: 'tour-result-card',
    title: 'Review & use it',
    body: 'Review the result, then Copy it or Replace it right on the page.',
  },
  {
    targetId: 'tour-settings',
    title: 'Settings',
    body: 'Turn Quick Mode on or off, or add your own Groq key here.',
  },
]

interface Props {
  onFinish: () => void
}

// A guided, spotlight-style walkthrough: a dimmed backdrop with a lit
// cutout around the current step's real UI element, and a tooltip callout
// with a pointer connecting it to that cutout. Shown once, on first panel
// open (see App.tsx's tour-trigger effect).
export function Tour({ onFinish }: Props) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[index]
  const isLast = index === STEPS.length - 1

  useLayoutEffect(() => {
    if (!step.targetId) {
      setRect(null)
      return
    }
    const el = document.getElementById(step.targetId)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step.targetId])

  // Not enough room above the target for the tooltip — put it below instead.
  const tooltipBelow = !rect || rect.top < 160

  return (
    <div className="fixed inset-0 z-50">
      {rect ? (
        <div
          aria-hidden="true"
          className="animate-tour-fade absolute rounded-lg"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(7,40,30,0.65)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="animate-tour-fade absolute inset-0 bg-racing-950/65" />
      )}

      <div
        role="dialog"
        aria-label={step.title}
        className={`animate-tour-fade absolute left-4 right-4 rounded-xl border border-racing-900/10 bg-white p-4 shadow-lg ${
          rect ? '' : 'top-1/2 -translate-y-1/2'
        }`}
        style={
          rect
            ? tooltipBelow
              ? { top: rect.bottom + 14 }
              : { top: rect.top - 14, transform: 'translateY(-100%)' }
            : undefined
        }
      >
        {rect && (
          <span
            aria-hidden="true"
            className="absolute left-6 h-3 w-3 rotate-45 border-racing-900/10 bg-white"
            style={
              tooltipBelow
                ? { top: -6, borderTop: '1px solid', borderLeft: '1px solid' }
                : { bottom: -6, borderBottom: '1px solid', borderRight: '1px solid' }
            }
          />
        )}

        <h2 className="text-sm font-semibold text-racing-900">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-racing-800/85">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-racing-900' : 'bg-racing-900/20'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onFinish}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-racing-800 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            >
              Skip
            </button>
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="rounded-lg border border-racing-900/20 px-3 py-1.5 text-xs font-medium text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onFinish() : setIndex((i) => i + 1))}
              className="rounded-lg bg-racing-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
