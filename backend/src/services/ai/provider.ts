import { buildPrompt } from './prompts.js'
import { callGroq } from './providers/groq.js'
import type { StyleId } from '../../routes/styles.js'
import { ProviderHttpError, QuotaExhaustedError } from './errors.js'

export interface GenerateImprovementInput {
  text: string
  style: StyleId
  language?: string
  customInstruction?: string
}

export async function generateImprovement(input: GenerateImprovementInput): Promise<string> {
  const { system, user } = buildPrompt(input.style, input.text, input.customInstruction)

  try {
    return await callGroq(system, user)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('generateImprovement: Groq call failed.', message)

    // Groq answers 429 when the shared key is rate-limited or out of quota —
    // surfaced separately so clients can offer the bring-your-own-key flow.
    if (err instanceof ProviderHttpError && err.status === 429) {
      throw new QuotaExhaustedError(message)
    }
    throw err
  }
}
