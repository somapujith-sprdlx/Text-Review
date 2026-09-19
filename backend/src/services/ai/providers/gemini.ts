import { ProviderHttpError } from '../errors.js'

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

export async function callGemini(system: string, user: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash'
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

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
    throw new ProviderHttpError('Gemini', res.status, errBody)
  }

  const data = (await res.json()) as GeminiResponse
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!content) {
    throw new Error('Gemini returned an empty response')
  }
  return content.trim()
}
