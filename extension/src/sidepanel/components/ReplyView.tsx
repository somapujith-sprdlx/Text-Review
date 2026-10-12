import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReplyOption } from '../../../../shared/reply.js'
import { CheckIcon, RefreshIcon } from './Icons.js'

interface Props {
  // The message the user received (what the replies answer).
  message: string
  replies: ReplyOption[]
  loading: boolean
  error: string | null
  notice: string | null
  // Replies are editable so the user can tweak one before inserting it.
  onEdit: (index: number, value: string) => void
  onInsert: (text: string) => void
  onCopy: (text: string) => void
  onRegenerate: () => void
  onSwitchToImprove: () => void
}

export function ReplySkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">Writing replies…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="animate-pulse rounded-xl border border-racing-900/10 bg-white p-3 shadow-sm"
        >
          <div className="mb-3 h-4 w-20 rounded-full bg-racing-900/10" />
          <div className="space-y-2.5">
            <div className="h-3 w-11/12 rounded bg-racing-900/10" />
            <div className="h-3 w-3/5 rounded bg-racing-900/10" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ReplyCard({
  option,
  onEdit,
  onInsert,
  onCopy,
}: {
  option: ReplyOption
  onEdit: (value: string) => void
  onInsert: () => void
  onCopy: () => void
}) {
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [option.text])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <div className="rounded-xl border border-racing-900/15 bg-white p-3 shadow-sm focus-within:border-racing-900">
      <span className="inline-block rounded-full bg-brass/20 px-2 py-0.5 text-[11px] font-semibold text-racing-900">
        {option.label}
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={option.text}
        onChange={(e) => onEdit(e.target.value)}
        aria-label={`${option.label} reply — you can edit it before using it`}
        className="mt-2 block w-full resize-none bg-transparent text-sm leading-relaxed text-racing-950 focus:outline-none"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onInsert}
          className="flex-1 rounded-lg bg-racing-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          Insert in reply box
        </button>
        <button
          type="button"
          onClick={() => {
            onCopy()
            setCopied(true)
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-racing-900/20 bg-white px-3.5 py-2 text-sm font-medium text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          {copied && <CheckIcon />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export function ReplyView({
  message,
  replies,
  loading,
  error,
  notice,
  onEdit,
  onInsert,
  onCopy,
  onRegenerate,
  onSwitchToImprove,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-racing-900">Reply</h2>
        <button
          type="button"
          onClick={onSwitchToImprove}
          className="rounded-md px-1.5 py-0.5 text-xs font-medium text-racing-800 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          Improve this text instead
        </button>
      </div>

      <div className="rounded-xl border border-racing-900/10 bg-white/70 px-3 py-2.5">
        <span className="mb-1 block text-xs font-medium text-racing-800/75">Message</span>
        <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-racing-950/80">{message}</p>
      </div>

      {loading && <ReplySkeleton />}

      {error && !loading && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRegenerate}
            className="shrink-0 rounded-md px-2 py-1 font-semibold hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && replies.length > 0 && (
        <div className="space-y-3">
          {replies.map((option, i) => (
            <ReplyCard
              // Replies are replaced wholesale on regenerate, so index keys are stable enough.
              key={i}
              option={option}
              onEdit={(value) => onEdit(i, value)}
              onInsert={() => onInsert(option.text)}
              onCopy={() => onCopy(option.text)}
            />
          ))}

          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-racing-900/20 bg-white py-2 text-sm font-medium text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            <RefreshIcon />
            Regenerate
          </button>

          <p aria-live="polite" className="min-h-[1.25rem] text-xs text-racing-800/80">
            {notice}
          </p>
        </div>
      )}
    </div>
  )
}
