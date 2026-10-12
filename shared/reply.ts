// Shared by the backend and the extension — keep this file dependency-free.
//
// "Reply" turns a selected message into a few ready-to-send replies written
// the way the user actually texts. Like rewrites, it runs on both the backend
// (free tier) and straight from the extension (bring-your-own-key), so the
// prompt and the parser live here.
import { profileToPromptLines, type WritingProfile } from './profile.js'

export const MAX_REPLY_SOURCE_LENGTH = 1000
export const REPLY_OPTION_COUNT = 3

export interface ReplyOption {
  // One or two words naming the direction ("Sounds good", "Ask details").
  label: string
  text: string
}

export function buildReplyPrompt(message: string, profile?: WritingProfile): { system: string; user: string } {
  const preferenceLines = profile ? profileToPromptLines(profile) : []
  const samples = profile?.writingSamples ?? []

  const preferenceBlock =
    preferenceLines.length > 0
      ? `\n\nWRITER'S PREFERENCES:\n${preferenceLines.map((line) => `- ${line}`).join('\n')}`
      : ''

  const styleBlock =
    samples.length > 0
      ? `\n\nHOW THE WRITER ACTUALLY TEXTS (real messages they sent — copy this voice exactly):\n${samples
          .map((s) => `- ${s}`)
          .join(
            '\n',
          )}\nMirror their habits: spelling quirks and shortcuts, stretched letters (like "heyyy"), capitalization, punctuation (or lack of it), emoji use, slang and typical message length. Write like this person typing quickly, not like an assistant.`
      : ''

  const system = `You write replies on behalf of the user. You will be given a message they received. Draft ${REPLY_OPTION_COUNT} different replies they could send back.${preferenceBlock}${styleBlock}

RULES:
1. Each reply must take a clearly different direction that makes sense for the message (for example agree, ask a question, politely decline, or buy time).
2. Match the language of the received message.
3. Do not invent specific facts, dates, prices or commitments that the message does not support — keep it natural and open where details are unknown.
4. Keep each reply roughly as long as the writer would really send.
5. Give each reply a short label of one to three words naming its direction.
6. Return ONLY valid JSON, no markdown, in exactly this shape:
{"replies":[{"label":"...","text":"..."}]}`

  return { system, user: `MESSAGE RECEIVED:\n${message}` }
}

// Models sometimes wrap JSON in fences or add a sentence around it — be
// forgiving, and never return nothing when there is usable text.
export function parseReplyOptions(raw: string): ReplyOption[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { replies?: unknown }
      if (Array.isArray(parsed.replies)) {
        const options = parsed.replies
          .map((entry): ReplyOption | null => {
            if (typeof entry !== 'object' || entry === null) return null
            const { label, text } = entry as { label?: unknown; text?: unknown }
            if (typeof text !== 'string' || text.trim() === '') return null
            return {
              label: typeof label === 'string' && label.trim() !== '' ? label.trim().slice(0, 40) : 'Reply',
              text: text.trim(),
            }
          })
          .filter((option): option is ReplyOption => option !== null)
          .slice(0, REPLY_OPTION_COUNT)
        if (options.length > 0) return options
      }
    } catch {
      // fall through to the plain-text fallback below
    }
  }

  const fallback = cleaned.trim()
  return fallback ? [{ label: 'Reply', text: fallback }] : []
}
