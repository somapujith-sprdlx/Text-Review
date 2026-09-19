import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CheckIcon, RefreshIcon } from './Icons.js'

interface Props {
  result: string
  notice: string | null
  onChange: (value: string) => void
  onReplace: () => void
  onCopy: () => void
  onRetry: () => void
}

export function ResultSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-racing-900/10 bg-white p-3 shadow-sm"
    >
      <span className="sr-only">Improving your text…</span>
      <div className="animate-pulse space-y-2.5" aria-hidden="true">
        <div className="h-3 w-11/12 rounded bg-racing-900/10" />
        <div className="h-3 w-full rounded bg-racing-900/10" />
        <div className="h-3 w-3/5 rounded bg-racing-900/10" />
      </div>
    </div>
  )
}

export function ResultCard({ result, notice, onChange, onReplace, onCopy, onRetry }: Props) {
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [result])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <div>
      <div className="rounded-xl border-2 border-racing-900 bg-white p-3 shadow-sm">
        <textarea
          ref={ref}
          value={result}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Improved text — you can edit it before using it"
          className="block w-full resize-none bg-transparent text-sm leading-relaxed text-racing-950 focus:outline-none"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onReplace}
          className="flex-1 rounded-lg bg-racing-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-racing-50"
        >
          Replace in page
        </button>
        <button
          type="button"
          onClick={() => {
            onCopy()
            setCopied(true)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-racing-900/20 bg-white px-3.5 py-2.5 text-sm font-medium text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          {copied && <CheckIcon className="text-racing-800" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={onRetry}
          aria-label="Try again"
          title="Try again"
          className="rounded-lg border border-racing-900/20 bg-white p-2.5 text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          <RefreshIcon />
        </button>
      </div>

      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs text-racing-800/80">
        {notice}
      </p>
    </div>
  )
}
