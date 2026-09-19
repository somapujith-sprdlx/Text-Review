import type { StyleId } from '../../routes/styles.js'

const STYLE_INSTRUCTIONS: Record<StyleId, string> = {
  improve: 'Rewrite the text to improve grammar, clarity and readability, without changing its tone.',
  formal: 'Rewrite the text in a formal tone.',
  professional: 'Rewrite the text for workplace/business communication.',
  casual: 'Rewrite the text in a natural, conversational tone.',
  friendly: 'Rewrite the text to sound warm and approachable.',
  concise: 'Rewrite the text to be shorter while preserving its full meaning.',
  'clear-simple': 'Rewrite the text to be as easy to understand as possible.',
  'grammar-fix': 'Fix grammar, spelling and punctuation only. Do not change tone or wording beyond what is needed for correctness.',
  custom: 'Rewrite the text according to the custom instruction provided below.',
}

const BASE_RULES = `RULES:
1. Preserve the original meaning.
2. Do not invent facts.
3. Do not add unsupported claims.
4. Correct grammar and spelling.
5. Keep important names, numbers and URLs unchanged.
6. Return only the rewritten text, with no preamble or explanation.`

export function buildPrompt(
  style: StyleId,
  text: string,
  customInstruction?: string,
): { system: string; user: string } {
  const task = STYLE_INSTRUCTIONS[style]
  const customBlock =
    style === 'custom' && customInstruction
      ? `\n\nCUSTOM INSTRUCTION:\n${customInstruction}`
      : ''

  const system = `You are a professional writing assistant.

TASK:
${task}${customBlock}

${BASE_RULES}`

  const user = text

  return { system, user }
}
