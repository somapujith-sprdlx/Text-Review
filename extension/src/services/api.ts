import type { ImproveRequest, ImproveResponse, ImproveErrorResponse, StyleOption } from '../types/index.js'

// Set VITE_API_BASE_URL in extension/.env.production to the deployed Worker URL.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

export async function fetchStyles(): Promise<StyleOption[]> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api/styles`)
  } catch {
    throw new Error('Something went wrong. Try again.')
  }
  if (!res.ok) {
    throw new Error('Something went wrong. Try again.')
  }
  const body = (await res.json().catch(() => null)) as { styles: StyleOption[] } | null
  if (!body) {
    throw new Error('Something went wrong. Try again.')
  }
  return body.styles
}

export async function improveText(req: ImproveRequest): Promise<ImproveResponse> {
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
    throw new Error('Something went wrong. Try again.', { cause: networkErr })
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    console.error('Text Quality Enhancer: /api/improve returned', res.status, bodyText)
    const body = ((): ImproveErrorResponse | null => {
      try {
        return JSON.parse(bodyText)
      } catch {
        return null
      }
    })()
    throw new Error(body?.error || 'Something went wrong. Try again.')
  }

  return (await res.json()) as ImproveResponse
}
