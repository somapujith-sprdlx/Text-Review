// Shared by the backend and the extension — keep this file dependency-free.
//
// The user's writing preferences. Stored per Google account in Neon, cached
// in the extension, and applied by buildPrompt() (prompts.ts) on every path —
// including bring-your-own-key requests, which never touch the backend.

export const TONES = ['default', 'casual', 'casual-professional', 'professional', 'friendly', 'formal'] as const
export const VERBOSITIES = ['default', 'short', 'detailed'] as const
export const EMOJI_USAGES = ['default', 'none', 'rare', 'frequent'] as const

export type Tone = (typeof TONES)[number]
export type Verbosity = (typeof VERBOSITIES)[number]
export type EmojiUsage = (typeof EMOJI_USAGES)[number]

export const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 500

export interface WritingProfile {
  tone: Tone
  verbosity: Verbosity
  emojiUsage: EmojiUsage
  customInstructions: string
}

// 'default' everywhere means "no preference" — buildPrompt adds nothing for it.
export const DEFAULT_PROFILE: WritingProfile = {
  tone: 'default',
  verbosity: 'default',
  emojiUsage: 'default',
  customInstructions: '',
}

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

// Accepts anything (a request body, a stored row, a stale cache from an older
// extension version) and always returns a valid profile: unknown enum values
// fall back to 'default', free text is whitespace-collapsed and capped.
export function sanitizeProfile(raw: unknown): WritingProfile {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const custom =
    typeof input.customInstructions === 'string'
      ? input.customInstructions.replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH)
      : ''
  return {
    tone: pick(TONES, input.tone, DEFAULT_PROFILE.tone),
    verbosity: pick(VERBOSITIES, input.verbosity, DEFAULT_PROFILE.verbosity),
    emojiUsage: pick(EMOJI_USAGES, input.emojiUsage, DEFAULT_PROFILE.emojiUsage),
    customInstructions: custom,
  }
}

export function isDefaultProfile(profile: WritingProfile): boolean {
  return (
    profile.tone === 'default' &&
    profile.verbosity === 'default' &&
    profile.emojiUsage === 'default' &&
    profile.customInstructions === ''
  )
}

const TONE_LINES: Record<Exclude<Tone, 'default'>, string> = {
  casual: 'Tone: casual and conversational.',
  'casual-professional': 'Tone: casual but still professional.',
  professional: 'Tone: professional.',
  friendly: 'Tone: warm and friendly.',
  formal: 'Tone: formal.',
}

const VERBOSITY_LINES: Record<Exclude<Verbosity, 'default'>, string> = {
  short: 'Length: keep it short and to the point.',
  detailed: 'Length: it is fine to be thorough and detailed.',
}

const EMOJI_LINES: Record<Exclude<EmojiUsage, 'default'>, string> = {
  none: 'Emojis: never use emojis.',
  rare: 'Emojis: use emojis rarely.',
  frequent: 'Emojis: emojis are welcome.',
}

// One short line per non-default preference; empty when the profile has none.
export function profileToPromptLines(profile: WritingProfile): string[] {
  const lines: string[] = []
  if (profile.tone !== 'default') lines.push(TONE_LINES[profile.tone])
  if (profile.verbosity !== 'default') lines.push(VERBOSITY_LINES[profile.verbosity])
  if (profile.emojiUsage !== 'default') lines.push(EMOJI_LINES[profile.emojiUsage])
  if (profile.customInstructions) lines.push(`Also: ${profile.customInstructions}`)
  return lines
}
