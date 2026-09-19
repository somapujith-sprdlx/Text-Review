import { describe, it, expect } from 'vitest'
import { app } from '../src/index.js'

describe('GET /api/styles', () => {
  it('returns the list of writing styles', async () => {
    const res = await app.request('/api/styles')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body.styles)).toBe(true)
    expect(body.styles.length).toBe(16)

    const ids = body.styles.map((s: { id: string }) => s.id)
    expect(ids).toEqual([
      'improve',
      'formal',
      'professional',
      'casual',
      'friendly',
      'concise',
      'clear-simple',
      'grammar-fix',
      'custom',
      'exec-summary',
      'founder-email',
      'pass-note',
      'ic-memo',
      'dd-questions',
      'action-items',
      'lp-update',
    ])
  })
})
