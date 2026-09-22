import { ProviderHttpError } from '../errors.js'
import { getGroqKeys } from '../keyPool.js'

interface GroqResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
}

async function callGroqWithKey(system: string, user: string, apiKey: string): Promise<string> {
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new ProviderHttpError('Groq', res.status, errBody)
  }

  const data = (await res.json()) as GroqResponse
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('Groq returned an empty response')
  }
  return content.trim()
}

// A rate-limited or rejected key moves on to the next one in the pool —
// that's the whole point of having several shared keys for the free tier.
// Anything else (a bad request, a Groq outage, a network error) isn't fixed
// by switching keys, so it's thrown immediately instead of burning through
// the rest of the pool for no reason.
const RETRYABLE_STATUSES = new Set([401, 403, 429])

export async function callGroq(system: string, user: string): Promise<string> {
  const keys = getGroqKeys()
  if (keys.length === 0) {
    throw new Error('No Groq API key configured')
  }

  // A random start spreads load evenly across requests without needing to
  // remember which key was used last — Workers don't reliably keep that
  // state warm between requests.
  const start = Math.floor(Math.random() * keys.length)
  let lastErr: unknown

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length]
    try {
      return await callGroqWithKey(system, user, key)
    } catch (err) {
      lastErr = err
      const retryable = err instanceof ProviderHttpError && RETRYABLE_STATUSES.has(err.status)
      if (!retryable) throw err
      console.error(
        `Text Quality Enhancer: Groq key ${i + 1}/${keys.length} failed (${(err as ProviderHttpError).status}), trying next key`,
      )
    }
  }

  // Every key in the pool hit a retryable failure — surface the last one so
  // the caller can tell real quota exhaustion (429, all keys rate-limited)
  // from a misconfigured pool (401/403, all keys rejected).
  throw lastErr
}
