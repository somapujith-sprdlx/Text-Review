import { buildPrompt } from './prompts.js'
import { callGroq } from './providers/groq.js'
import type { StyleId } from '../../routes/styles.js'
import { ProviderHttpError, QuotaExhaustedError } from './errors.js'
import type { WritingProfile } from '../../../../shared/profile.js'
import { buildReplyPrompt, parseReplyOptions, type ReplyOption } from '../../../../shared/reply.js'

export interface GenerateImprovementInput {
  text: string
  style: StyleId
  language?: string
  customInstruction?: string
  profile?: WritingProfile
}

export interface GenerateRepliesInput {
  text: string
  profile?: WritingProfile
}

// One path for every Groq call so quota handling can't drift between features.
async function callProvider(system: string, user: string, caller: string): Promise<string> {
  try {
    return await callGroq(system, user)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${caller}: Groq call failed.`, message)

    // Groq answers 429 when the shared key is rate-limited or out of quota —
    // surfaced separately so clients can offer the bring-your-own-key flow.
    if (err instanceof ProviderHttpError && err.status === 429) {
      throw new QuotaExhaustedError(message)
    }
    throw err
  }
}

export async function generateImprovement(input: GenerateImprovementInput): Promise<string> {
  const { system, user } = buildPrompt(input.style, input.text, input.customInstruction, input.profile)
  return callProvider(system, user, 'generateImprovement')
}

export async function generateReplies(input: GenerateRepliesInput): Promise<ReplyOption[]> {
  const { system, user } = buildReplyPrompt(input.text, input.profile)
  const raw = await callProvider(system, user, 'generateReplies')

  const options = parseReplyOptions(raw)
  if (options.length === 0) {
    throw new Error('Groq returned no usable replies')
  }
  return options
}
