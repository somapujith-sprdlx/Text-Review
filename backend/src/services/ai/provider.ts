import OpenAI from 'openai'
import { buildPrompt } from './prompts.js'
import type { StyleId } from '../../routes/styles.js'

export interface GenerateImprovementInput {
  text: string
  style: StyleId
  language?: string
  customInstruction?: string
}

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}

export async function generateImprovement(input: GenerateImprovementInput): Promise<string> {
  const { system, user } = buildPrompt(input.style, input.text, input.customInstruction)
  const openai = getClient()

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned an empty response')
  }
  return content.trim()
}
