import type { ImproveRequest, ImproveResponse, ImproveErrorResponse, UsageInfo } from '../types/index.js'
import { BASE_URL } from './config.js'
import { getDeviceId } from './deviceId.js'
import { reportImprovementCompleted } from './deviceState.js'
import { LimitReachedError, RatingRequiredError } from './errors.js'
import { fetchWithTimeout } from './fetchWithTimeout.js'
import { improveWithGroqKey } from './groq.js'
import { getGroqKey } from './keyStore.js'
import { saveUsageCache } from './usageCache.js'

const GENERIC_ERROR = 'Something went wrong. Try again.'
const IMPROVE_TIMEOUT_MS = 25_000
const USAGE_TIMEOUT_MS = 10_000

// A saved Groq key always wins: the request goes straight to Groq and never
// spends the shared free allowance. Either path is reported to
// /api/device-state/increment afterward — the only place both funnel
// through — so the lifetime-improvement count (and rating gate) covers BYOK
// too, even though BYOK requests otherwise never touch this backend.
export async function improveText(req: ImproveRequest): Promise<ImproveResponse> {
  const apiKey = await getGroqKey()
  const result = apiKey
    ? { requestId: crypto.randomUUID(), style: req.style, outputText: await improveWithGroqKey(apiKey, req) }
    : await improveViaBackend(req)
  void reportImprovementCompleted()
  return result
}

async function improveViaBackend(req: ImproveRequest): Promise<ImproveResponse> {
  let res: Response
  try {
    const deviceId = await getDeviceId()
    res = await fetchWithTimeout(
      `${BASE_URL}/api/improve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
        body: JSON.stringify(req),
      },
      IMPROVE_TIMEOUT_MS,
    )
  } catch (networkErr) {
    console.error('Text Quality Enhancer: fetch to /api/improve threw', networkErr)
    // Preserve the real cause (network failure, CORS rejection, etc.) on
    // the error object so callers that log server-side (e.g. the service
    // worker) can diagnose it, while the message itself stays the generic
    // user-facing copy required everywhere this error surfaces in the UI.
    throw new Error(GENERIC_ERROR, { cause: networkErr })
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    const body = ((): ImproveErrorResponse | null => {
      try {
        return JSON.parse(bodyText)
      } catch {
        return null
      }
    })()

    // The backend answers 429 both when this client is rate-limited and when
    // its shared AI providers are out of quota — either way the free
    // allowance is spent.
    if (res.status === 429) {
      if (body?.usage) void saveUsageCache(body.usage)
      throw new LimitReachedError(body?.usage)
    }

    // Backstop only — App.tsx checks cached device state before a request
    // can even be attempted, so this should rarely fire in normal use. See
    // middleware/ratingGate.ts.
    if (res.status === 403 && body?.code === 'RATING_REQUIRED') {
      throw new RatingRequiredError()
    }

    console.error('Text Quality Enhancer: /api/improve returned', res.status, bodyText)
    throw new Error(body?.error || GENERIC_ERROR)
  }

  const data = (await res.json()) as ImproveResponse
  if (data.usage) void saveUsageCache(data.usage)
  return data
}

// Read-only — lets the panel show today's count as soon as it opens. Best
// effort: a failure here just leaves the badge showing plain "Free".
export async function fetchUsage(): Promise<UsageInfo | null> {
  try {
    const deviceId = await getDeviceId()
    const res = await fetchWithTimeout(
      `${BASE_URL}/api/usage`,
      { headers: { 'X-Device-Id': deviceId } },
      USAGE_TIMEOUT_MS,
    )
    if (!res.ok) return null
    const body = (await res.json()) as { usage?: UsageInfo }
    if (body.usage) void saveUsageCache(body.usage)
    return body.usage ?? null
  } catch {
    return null
  }
}
