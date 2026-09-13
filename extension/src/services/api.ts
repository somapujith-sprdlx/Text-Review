import type { ImproveRequest, ImproveResponse, ImproveErrorResponse, StyleOption } from '../types/index.js'

const BASE_URL = 'http://localhost:8787'

export async function fetchStyles(): Promise<StyleOption[]> {
  const res = await fetch(`${BASE_URL}/api/styles`)
  if (!res.ok) {
    throw new Error('Something went wrong. Try again.')
  }
  const body = (await res.json()) as { styles: StyleOption[] }
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
  } catch {
    throw new Error('Something went wrong. Try again.')
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ImproveErrorResponse | null
    throw new Error(body?.error || 'Something went wrong. Try again.')
  }

  return (await res.json()) as ImproveResponse
}
