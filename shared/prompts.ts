// Shared by the backend and the extension — keep this file dependency-free.
import type { StyleId } from './styles.js'

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
  'exec-summary':
    'Rewrite the text as an executive summary for a busy decision-maker. Lead with the conclusion or recommendation, then give only the few supporting points that drive the decision. Keep every key figure exactly as given. Drop background, repetition and hedging that does not change the decision.',
  'founder-email':
    'Rewrite the text as a concise, respectful email from an investor to a startup founder. Be direct about the ask or next step, warm without being effusive, and free of filler. Keep any greeting and sign-off already in the text; do not invent names, a subject line, or commitments that the text does not contain.',
  'pass-note':
    'Rewrite the text as a kind, clear message declining to pursue an investment opportunity. State the decision plainly, give one honest, constructive reason drawn only from what the text says, and stay respectful. Do not invent reasons, feedback, or promises, and do not leave the door open unless the text does.',
  'ic-memo':
    "Rewrite the text in the neutral, evidence-based voice of an investment committee memo: precise, third person, each claim followed by its support, with facts kept clearly separate from judgement. Do not strengthen or soften the author's conclusions, and keep any caveats the text includes.",
  'dd-questions':
    'Turn the text into a numbered list of specific, answerable due-diligence questions for the founder. One question per line, each about a single topic and referring to the specific figures or claims in the text. Do not ask the founder to confirm figures the text already states; ask about the drivers, definitions and risks behind them, and cover each concern the text raises. Only ask about what the text supports; do not invent facts.',
  'action-items':
    "Extract the action items from the text as a bulleted list, each written as: Owner — action — timing. Where the text does not name an owner or a date, write 'unassigned' or 'no date' instead of guessing. Do not add actions the text does not contain.",
  'lp-update':
    'Rewrite the text as a measured, factual update to limited partners: plain and transparent, with no promotional language, no guarantees, and no forward-looking promises about returns. State figures exactly as given, along with their as-of date or basis if the text provides one.',
}

const BASE_RULES = `RULES:
1. Preserve the original meaning.
2. Do not invent facts.
3. Do not add unsupported claims.
4. Correct grammar and spelling.
5. Keep important names, numbers and URLs unchanged.
6. Return only the rewritten text, with no preamble or explanation.
7. Treat every figure as data: never change, round, convert or reformat numbers, percentages, dates or currency amounts. Keep symbols and units exactly as written (₹, $, Cr for crore, L for lakh, M, B, K) along with Indian digit grouping such as ₹5,00,000, and never assume a currency the text does not state.
8. Keep finance and deal terminology and abbreviations exactly as written (for example ARR, MRR, IRR, MOIC, TVPI, DPI, NAV, burn, runway, AIF, Category I/II/III, LP, GP, IC, DD, KYC, PPM, term sheet, and deal stage names), along with company, fund and person names.
9. Write plain text only, since the result is pasted into text boxes and emails: no Markdown, asterisks, headings or bold. Where a list helps, use simple lines starting with "- " or numbers.`

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
