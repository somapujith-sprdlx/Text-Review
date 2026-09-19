import { buildPrompt } from './prompts.js'
import { callGemini } from './providers/gemini.js'
import { callGroq } from './providers/groq.js'
import type { StyleId } from '../../routes/styles.js'
import { ProviderHttpError, QuotaExhaustedError } from './errors.js'

export interface GenerateImprovementInput {
  text: string
  style: StyleId
  language?: string
  customInstruction?: string
}

type ProviderCall = (system: string, user: string) => Promise<string>

// Tried in order; if one throws (quota exhausted, rate limited, key
// missing, transient outage) the next is tried instead of failing the
// whole request. Order = preference, not reliability — put the provider
// you want to bias toward first.
const PROVIDER_CHAIN: Array<{ name: string; call: ProviderCall }> = [
  { name: 'gemini', call: callGemini },
  { name: 'groq', call: callGroq },
]

export async function generateImprovement(input: GenerateImprovementInput): Promise<string> {
  const { system, user } = buildPrompt(input.style, input.text, input.customInstruction)

  const failures: string[] = []
  let quotaHit = false

  for (const provider of PROVIDER_CHAIN) {
    try {
      return await provider.call(system, user)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`generateImprovement: provider "${provider.name}" failed, trying next.`, message)
      failures.push(`${provider.name}: ${message}`)
      if (err instanceof ProviderHttpError && err.status === 429) quotaHit = true
    }
  }

  const summary = `All AI providers failed — ${failures.join(' | ')}`
  throw quotaHit ? new QuotaExhaustedError(summary) : new Error(summary)
}
