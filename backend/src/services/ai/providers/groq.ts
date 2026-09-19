interface GroqResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
}

export async function callGroq(system: string, user: string): Promise<string> {
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured')
  }

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
    throw new Error(`Groq API error ${res.status}: ${errBody}`)
  }

  const data = (await res.json()) as GroqResponse
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('Groq returned an empty response')
  }
  return content.trim()
}
