import type { ImproveRequest, ImproveResponse, ImproveErrorResponse } from '../types/index.js'
import { LimitReachedError } from './errors.js'
import { improveWithGroqKey } from './groq.js'
import { getGroqKey } from './keyStore.js'

// Set VITE_API_BASE_URL in extension/.env.production to the deployed Worker URL.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

const GENERIC_ERROR = 'Something went wrong. Try again.'

// A saved Groq key always wins: the request goes straight to Groq and never
// spends the shared free allowance.
export async function improveText(req: ImproveRequest): Promise<ImproveResponse> {
  const apiKey = await getGroqKey()
  if (apiKey) {
    const outputText = await improveWithGroqKey(apiKey, req)
    return { requestId: crypto.randomUUID(), style: req.style, outputText }
  }
  return improveViaBackend(req)
}

async function improveViaBackend(req: ImproveRequest): Promise<ImproveResponse> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api/improve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch (networkErr) {
    console.error('Text Quality Enhancer: fetch to /api/improve threw', networkErr)
    // Preserve the real cause (network failure, CORS rejection, etc.) on
    // the error object so callers that log server-side (e.g. the service
    // worker) can diagnose it, while the message itself stays the generic
    // user-facing copy required everywhere this error surfaces in the UI.
    throw new Error(GENERIC_ERROR, { cause: networkErr })
  }

  if (!res.ok) {
    // The backend answers 429 both when this client is rate-limited and when
    // its shared AI providers are out of quota — either way the free
    // allowance is spent.
    if (res.status === 429) throw new LimitReachedError()

    const bodyText = await res.text().catch(() => '')
    console.error('Text Quality Enhancer: /api/improve returned', res.status, bodyText)
    const body = ((): ImproveErrorResponse | null => {
      try {
        return JSON.parse(bodyText)
      } catch {
        return null
      }
    })()
    throw new Error(body?.error || GENERIC_ERROR)
  }

  return (await res.json()) as ImproveResponse
}
