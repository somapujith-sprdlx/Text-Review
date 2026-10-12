import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_PROFILE,
  MAX_CUSTOM_INSTRUCTIONS_LENGTH,
  MAX_WRITING_SAMPLE_LENGTH,
  MAX_WRITING_SAMPLES,
  sanitizeProfile,
  type EmojiUsage,
  type Tone,
  type Verbosity,
  type WritingProfile,
} from '../../../../shared/profile.js'
import { fetchProfile, getCachedProfile, saveProfile } from '../../services/profile.js'

const TONE_LABELS: Record<Tone, string> = {
  default: 'No preference',
  casual: 'Casual',
  'casual-professional': 'Casual-professional',
  professional: 'Professional',
  friendly: 'Friendly',
  formal: 'Formal',
}

const VERBOSITY_LABELS: Record<Verbosity, string> = {
  default: 'No preference',
  short: 'Short and direct',
  detailed: 'Detailed',
}

const EMOJI_LABELS: Record<EmojiUsage, string> = {
  default: 'No preference',
  none: 'Never',
  rare: 'Rarely',
  frequent: 'Often',
}

type Status = 'idle' | 'saved' | 'error'

const SELECT_CLASS =
  'mt-1 w-full rounded-lg border border-racing-900/15 bg-white px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass disabled:opacity-60'

function sameProfile(a: WritingProfile, b: WritingProfile): boolean {
  return (
    a.tone === b.tone &&
    a.verbosity === b.verbosity &&
    a.emojiUsage === b.emojiUsage &&
    a.customInstructions === b.customInstructions &&
    a.writingSamples.length === b.writingSamples.length &&
    a.writingSamples.every((s, i) => s === b.writingSamples[i])
  )
}

interface ParsedSamples {
  // What the textarea should show after capping.
  text: string
  // The cleaned list that goes into the profile.
  samples: string[]
  clipped: boolean
  dropped: boolean
}

// One message per line. Each line is capped at MAX_WRITING_SAMPLE_LENGTH and
// only the first MAX_WRITING_SAMPLES non-empty lines are kept. Nothing inside
// a line is touched (casing, "heyyy", emoji, punctuation are the whole point);
// blank lines stay in the textarea while typing but never become samples.
function parseSamples(raw: string): ParsedSamples {
  const lines: string[] = []
  const samples: string[] = []
  let clipped = false
  let dropped = false
  for (const line of raw.split(/\r\n|\r|\n/)) {
    if (line.trim() === '') {
      lines.push(line)
      continue
    }
    if (samples.length >= MAX_WRITING_SAMPLES) {
      dropped = true
      continue
    }
    let kept = line
    if (kept.length > MAX_WRITING_SAMPLE_LENGTH) {
      kept = kept.slice(0, MAX_WRITING_SAMPLE_LENGTH)
      clipped = true
    }
    lines.push(kept)
    samples.push(kept)
  }
  return { text: lines.join('\n'), samples, clipped, dropped }
}

export function Personalization() {
  // `saved` is the last profile known to be on the server (or the local cache
  // until the first fetch lands); `draft` is what the form currently shows.
  const [saved, setSaved] = useState<WritingProfile>(DEFAULT_PROFILE)
  const [draft, setDraft] = useState<WritingProfile>(DEFAULT_PROFILE)
  const [syncing, setSyncing] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  // The texting-style textarea keeps its own raw text (blank lines and a
  // trailing newline must survive while typing); draft.writingSamples is the
  // cleaned list derived from it.
  const [samplesText, setSamplesText] = useState('')
  const [sampleHint, setSampleHint] = useState<string | null>(null)
  const edited = useRef(false)

  // Replace the whole form with a profile (cache, server copy, reset).
  function showProfile(profile: WritingProfile) {
    setDraft(profile)
    setSamplesText(profile.writingSamples.join('\n'))
    setSampleHint(null)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Cached value first so the form is populated immediately, then
      // reconcile with the server.
      const cached = await getCachedProfile()
      if (cancelled) return
      if (!edited.current) {
        setSaved(cached)
        showProfile(cached)
      }
      const fresh = await fetchProfile()
      if (cancelled) return
      if (fresh) {
        setSaved(fresh)
        // Don't clobber what the user is already typing.
        if (!edited.current) showProfile(fresh)
      }
      setSyncing(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function update(patch: Partial<WritingProfile>) {
    edited.current = true
    setStatus('idle')
    setDraft((d) => ({ ...d, ...patch }))
  }

  async function persist(next: WritingProfile) {
    setSaving(true)
    setStatus('idle')
    const result = await saveProfile(next)
    setSaving(false)
    if (result) {
      edited.current = false
      setSaved(result)
      showProfile(result)
      setStatus('saved')
    } else {
      setStatus('error')
    }
  }

  const dirty = !sameProfile(sanitizeProfile(draft), saved)
  const atDefault = sameProfile(sanitizeProfile(draft), DEFAULT_PROFILE) && sameProfile(saved, DEFAULT_PROFILE)
  const counter = draft.customInstructions.length
  const sampleCount = draft.writingSamples.length

  function updateSamples(raw: string) {
    const parsed = parseSamples(raw)
    setSamplesText(parsed.text)
    const hints: string[] = []
    if (parsed.clipped) hints.push(`Messages are cut at ${MAX_WRITING_SAMPLE_LENGTH} characters.`)
    if (parsed.dropped) hints.push(`Only the first ${MAX_WRITING_SAMPLES} messages are kept.`)
    setSampleHint(hints.length > 0 ? hints.join(' ') : null)
    update({ writingSamples: parsed.samples })
  }

  return (
    <section className="rounded-xl border border-racing-900/10 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-racing-900">Personalization</h2>
      <p className="mt-1 text-xs leading-relaxed text-racing-800/80">
        Lipi applies tone, length and emojis to every rewrite and reply.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="pref-tone" className="text-xs font-medium text-racing-900">
            Tone
          </label>
          <select
            id="pref-tone"
            value={draft.tone}
            onChange={(e) => update({ tone: e.target.value as Tone })}
            disabled={saving}
            className={SELECT_CLASS}
          >
            {(Object.keys(TONE_LABELS) as Tone[]).map((t) => (
              <option key={t} value={t}>
                {TONE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pref-length" className="text-xs font-medium text-racing-900">
            Length
          </label>
          <select
            id="pref-length"
            value={draft.verbosity}
            onChange={(e) => update({ verbosity: e.target.value as Verbosity })}
            disabled={saving}
            className={SELECT_CLASS}
          >
            {(Object.keys(VERBOSITY_LABELS) as Verbosity[]).map((v) => (
              <option key={v} value={v}>
                {VERBOSITY_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pref-emoji" className="text-xs font-medium text-racing-900">
            Emojis
          </label>
          <select
            id="pref-emoji"
            value={draft.emojiUsage}
            onChange={(e) => update({ emojiUsage: e.target.value as EmojiUsage })}
            disabled={saving}
            className={SELECT_CLASS}
          >
            {(Object.keys(EMOJI_LABELS) as EmojiUsage[]).map((o) => (
              <option key={o} value={o}>
                {EMOJI_LABELS[o]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="pref-custom" className="text-xs font-medium text-racing-900">
              Custom instructions
            </label>
            <span
              className={`text-[11px] tabular-nums ${
                counter >= MAX_CUSTOM_INSTRUCTIONS_LENGTH ? 'text-red-700' : 'text-racing-800/70'
              }`}
            >
              {counter}/{MAX_CUSTOM_INSTRUCTIONS_LENGTH}
            </span>
          </div>
          <textarea
            id="pref-custom"
            rows={3}
            value={draft.customInstructions}
            maxLength={MAX_CUSTOM_INSTRUCTIONS_LENGTH}
            onChange={(e) => update({ customInstructions: e.target.value })}
            disabled={saving}
            placeholder="e.g. I'm a product manager. Keep sentences short and avoid jargon."
            className="mt-1 w-full resize-y rounded-lg border border-racing-900/15 bg-white px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass disabled:opacity-60"
          />
        </div>

        <div className="border-t border-racing-900/10 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="pref-samples" className="text-xs font-medium text-racing-900">
              My texting style
            </label>
            <span className="flex items-baseline gap-2">
              {sampleCount > 0 && (
                <button
                  type="button"
                  onClick={() => updateSamples('')}
                  disabled={saving}
                  className="rounded text-[11px] font-medium text-racing-800 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:opacity-60"
                >
                  Clear
                </button>
              )}
              <span
                className={`text-[11px] tabular-nums ${
                  sampleCount >= MAX_WRITING_SAMPLES ? 'text-red-700' : 'text-racing-800/70'
                }`}
              >
                {sampleCount}/{MAX_WRITING_SAMPLES} messages
              </span>
            </span>
          </div>
          <textarea
            id="pref-samples"
            rows={5}
            value={samplesText}
            onChange={(e) => updateSamples(e.target.value)}
            disabled={saving}
            spellCheck={false}
            aria-describedby="pref-samples-help"
            placeholder={'one message per line, e.g.\nheyyy running late, be there in 10\nlol yeah sounds good 😂'}
            className="mt-1 w-full resize-y rounded-lg border border-racing-900/15 bg-white px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass disabled:opacity-60"
          />
          <p id="pref-samples-help" className="mt-1 text-xs leading-relaxed text-racing-800/80">
            Paste a few real messages you&rsquo;ve sent. Lipi copies your spelling, slang, emoji and stretched letters
            when it writes replies. Stored with your account &mdash; clear it anytime.
          </p>
          {sampleHint && (
            <p role="status" className="mt-1 text-xs text-amber-800">
              {sampleHint}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void persist(sanitizeProfile(draft))}
          disabled={saving || !dirty}
          className="rounded-lg bg-racing-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-racing-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            edited.current = true
            showProfile(DEFAULT_PROFILE)
            void persist(DEFAULT_PROFILE)
          }}
          disabled={saving || atDefault}
          className="rounded-lg border border-racing-900/20 px-3 py-1.5 text-sm font-medium text-racing-900 hover:bg-racing-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:opacity-40"
        >
          Reset
        </button>
        <span aria-live="polite" className="text-xs">
          {status === 'saved' && <span className="font-medium text-racing-800">&#10003; Saved</span>}
          {status === 'error' && (
            <span role="alert" className="text-red-700">
              Couldn&rsquo;t save your preferences. Try again.
            </span>
          )}
          {status === 'idle' && syncing && <span className="text-racing-800/60">Syncing&hellip;</span>}
        </span>
      </div>
    </section>
  )
}
