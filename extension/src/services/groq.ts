import { buildPrompt } from '../../../shared/prompts.js'
import { STYLES, type StyleId } from '../../../shared/styles.js'
import type { ImproveRequest } from '../types/index.js'
import { InvalidKeyError } from './errors.js'

// Extension pages and the service worker are exempt from CORS for hosts in
// host_permissions, so these calls go straight from the browser to Groq —
// the user's key never touches our backend.
const GROQ_BASE = 'https://api.groq.com/openai/v1'
const GROQ_MODEL = 'openai/gpt-oss-120b'

const GENERIC_ERROR = 'Something went wrong. Try again.'

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>
}

// Cheap check that doesn't spend tokens. Resolves false only when Groq
// explicitly rejects the key; throws if Groq can't be reached at all.
export async function validateGroqKey(apiKey: string): Promise<boolean> {
  let res: Response
  try {
    res = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
  } catch (cause) {
    throw new Error("Couldn't reach Groq. Check your connection and try again.", { cause })
  }
  if (res.ok) return true
  if (res.status === 401 || res.status === 403) return false
  throw new Error(`Groq returned an unexpected error (${res.status}). Try again in a moment.`)
}

export async function improveWithGroqKey(apiKey: string, req: ImproveRequest): Promise<string> {
  if (!STYLES.some((s) => s.id === req.style)) {
    throw new Error('Unknown style.')
  }
  const { system, user } = buildPrompt(req.style as StyleId, req.text, req.customInstruction)

  let res: Response
  try {
    res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
      }),
    })
  } catch (cause) {
    throw new Error(GENERIC_ERROR, { cause })
  }

  if (res.status === 401 || res.status === 403) throw new InvalidKeyError()
  if (res.status === 429) {
    // The user's own key is rate-limited — not the shared allowance, so this
    // must not route them back into the "add a key" flow.
    throw new Error('Your Groq key has hit its rate limit. Try again in a minute.')
  }
  if (!res.ok) {
    console.error('Text Quality Enhancer: Groq returned', res.status, await res.text().catch(() => ''))
    throw new Error(GENERIC_ERROR)
  }

  const data = (await res.json().catch(() => null)) as GroqChatResponse | null
  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error(GENERIC_ERROR)
  return content
}
