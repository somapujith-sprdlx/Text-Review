import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { generateImprovement } from '../services/ai/provider.js'
import { STYLES, type StyleId } from './styles.js'

const VALID_STYLE_IDS = new Set(STYLES.map((s) => s.id))
const MAX_TEXT_LENGTH = 2000

export const improveRoute = new Hono()

improveRoute.post('/', async (c) => {
  let payload: { text?: unknown; style?: unknown; language?: unknown; customInstruction?: unknown }

  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400)
  }

  const { text, style, language, customInstruction } = payload

  if (typeof text !== 'string' || text.trim().length === 0) {
    return c.json({ error: 'Text is required.' }, 400)
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return c.json(
      { error: 'This text is too long. Please shorten it or split it into smaller sections.' },
      400,
    )
  }

  if (typeof style !== 'string' || !VALID_STYLE_IDS.has(style as StyleId)) {
    return c.json({ error: 'Unknown style.' }, 400)
  }

  try {
    const outputText = await generateImprovement({
      text,
      style: style as StyleId,
      language: typeof language === 'string' ? language : undefined,
      customInstruction: typeof customInstruction === 'string' ? customInstruction : undefined,
    })

    return c.json({
      requestId: randomUUID(),
      style,
      outputText,
    })
  } catch {
    return c.json({ error: 'Something went wrong. Try again.' }, 502)
  }
})
