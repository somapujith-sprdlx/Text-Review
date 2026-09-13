import { buildPrompt } from './prompts.js'
import type { StyleId } from '../../routes/styles.js'

export interface GenerateImprovementInput {
  text: string
  style: StyleId
  language?: string
  customInstruction?: string
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

export async function generateImprovement(input: GenerateImprovementInput): Promise<string> {
  const { system, user } = buildPrompt(input.style, input.text, input.customInstruction)
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash'
  const apiKey = process.env.GEMINI_API_KEY

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.7 },
      }),
    },
  )

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Gemini API error ${res.status}: ${errBody}`)
  }

  const data = (await res.json()) as GeminiResponse
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!content) {
    throw new Error('Gemini returned an empty response')
  }
  return content.trim()
}
