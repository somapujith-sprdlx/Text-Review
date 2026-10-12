// Shared by the backend tests and the extension — keep this file dependency-free.
//
// Picks the few messages, out of everything the user has typed, that best show
// HOW they write (spelling shortcuts, stretched letters, casing, emoji, slang,
// length) so a drafted reply can copy that voice. Pure and deterministic: the
// same candidates in the same order always give the same result. Candidate
// order is the tie-break, so pass the most recent message first.

// Words that mark a texting register. Matched as whole lowercase tokens.
const TEXTING_WORDS = new Set([
  'u', 'ur', 'r', 'y', 'ya', 'yo', 'pls', 'plz', 'thx', 'ty', 'np', 'gonna', 'wanna', 'gotta',
  'kinda', 'sorta', 'lol', 'lmao', 'lmfao', 'rofl', 'omg', 'bro', 'bruh', 'dude', 'nah', 'yep',
  'yup', 'nope', 'idk', 'idc', 'tbh', 'ngl', 'btw', 'imo', 'rn', 'af', 'cuz', 'cos', 'tho',
  'haha', 'hahaha', 'hehe', 'hmm', 'hmmm', 'ikr', 'omw', 'brb', 'smh', 'fr', 'bet', 'dope',
])

const EMOJI_RE = /\p{Extended_Pictographic}/u
const EMOTICON_RE = /(?:^|\s)(?::-?[)(DPpOo/\\]|;-?[)D]|<3|xD|XD)(?=\s|$)/
const STRETCHED_LETTER_RE = /(\p{L})\1{2,}/u
const STRETCHED_PUNCT_RE = /([!?])\1{1,}/
const URL_RE = /(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i
const HAS_VOICE_CHAR_RE = /[\p{L}\p{Extended_Pictographic}]/u

// Length buckets for the "mix of lengths" nudge.
const SHORT_MAX = 30
const MEDIUM_MAX = 80
// Bonus for the first pick in a length bucket; halves for the second, etc.
const LENGTH_MIX_BONUS = 3

// A candidate is skipped when it overlaps an already-chosen sample this much.
const NEAR_DUPLICATE_JACCARD = 0.6
const NEAR_DUPLICATE_CONTAINMENT = 0.85

function lengthBucket(text: string): 0 | 1 | 2 {
  const n = text.trim().length
  return n <= SHORT_MAX ? 0 : n <= MEDIUM_MAX ? 1 : 2
}

// Lowercased word tokens with letter stretching collapsed, so "heyyy whats up"
// and "hey, whats up!" compare as the same message.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\p{L})\1+/gu, '$1')
    .split(/[^\p{L}\p{N}']+/u)
    .filter((t) => t.length > 0)
    .concat(text.match(/\p{Extended_Pictographic}/gu) ?? [])
}

function isNearDuplicate(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return a.size === b.size
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  const union = a.size + b.size - shared
  if (shared / union >= NEAR_DUPLICATE_JACCARD) return true
  const smaller = Math.min(a.size, b.size)
  return smaller >= 3 && shared / smaller >= NEAR_DUPLICATE_CONTAINMENT
}

// How much personal voice one message carries. Higher is more distinctive.
// Exported for tests and tuning; callers should use pickRepresentativeSamples.
export function voiceScore(text: string): number {
  const trimmed = text.trim()
  const length = trimmed.length
  let score = 0

  // "www" inside a link is not a stretched letter.
  if (STRETCHED_LETTER_RE.test(trimmed.replace(URL_RE, ' '))) score += 3
  if (STRETCHED_PUNCT_RE.test(trimmed)) score += 1
  if (EMOJI_RE.test(trimmed) || EMOTICON_RE.test(trimmed)) score += 2

  const words = new Set(tokenize(trimmed))
  let slang = 0
  for (const word of words) if (TEXTING_WORDS.has(word)) slang++
  score += Math.min(slang, 3) * 1.5

  // Starts in lowercase, or uses a bare lowercase "i": casual casing.
  const firstLetter = trimmed.match(/\p{L}/u)?.[0]
  if (firstLetter && firstLetter === firstLetter.toLowerCase() && firstLetter !== firstLetter.toUpperCase()) {
    score += 1.5
  }
  if (/(^|[^\p{L}'])i(?=$|[^\p{L}])/u.test(trimmed)) score += 1

  // Trailing-off style: no closing punctuation, or an ellipsis.
  if (!/[.!?…"')\]]$/.test(trimmed) && !/\p{Extended_Pictographic}️?$/u.test(trimmed)) score += 1
  if (/\.{3,}|…/.test(trimmed)) score += 1

  if (length >= 6 && length <= 120) score += 1
  if (length < 6) score -= 3
  if (length > 160) score -= 1

  // Links and addresses are content, not voice.
  if (URL_RE.test(trimmed)) score -= 4
  // Stiff openers/sign-offs read as template text rather than texting.
  if (/^(dear|hello,|to whom|kind regards|best regards|sincerely)\b/i.test(trimmed)) score -= 2

  return score
}

interface Candidate {
  text: string
  score: number
  tokens: Set<string>
  bucket: 0 | 1 | 2
}

// Returns up to `limit` candidates, exactly as typed, most voice-rich first
// while avoiding near-duplicates and mixing short/medium/long messages.
// `alreadyPicked` are samples that will be sent anyway (e.g. the ones the user
// pasted by hand): they are never returned, but new picks stay distinct from
// them and avoid piling onto the lengths they already cover.
export function pickRepresentativeSamples(
  candidates: string[],
  limit: number,
  alreadyPicked: readonly string[] = [],
): string[] {
  const max = Math.floor(limit)
  if (!Array.isArray(candidates) || !(max > 0)) return []

  const chosenTokens: Set<string>[] = []
  const bucketCounts = [0, 0, 0]
  for (const text of alreadyPicked) {
    if (typeof text !== 'string' || text.trim().length === 0) continue
    chosenTokens.push(new Set(tokenize(text)))
    bucketCounts[lengthBucket(text)]++
  }

  const pool: Candidate[] = []
  candidates.forEach((text) => {
    if (typeof text !== 'string') return
    if (!HAS_VOICE_CHAR_RE.test(text)) return
    pool.push({
      text,
      score: voiceScore(text),
      tokens: new Set(tokenize(text)),
      bucket: lengthBucket(text),
    })
  })

  const picked: string[] = []
  while (picked.length < max && pool.length > 0) {
    let bestAt = -1
    let bestValue = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i]
      // Each extra pick in an already-used length bucket is worth less.
      const value = c.score + LENGTH_MIX_BONUS / (1 + bucketCounts[c.bucket])
      // Strictly greater and the pool keeps input order, so a tie goes to the
      // earlier candidate.
      if (value > bestValue) {
        bestValue = value
        bestAt = i
      }
    }
    const [best] = pool.splice(bestAt, 1)
    if (chosenTokens.some((t) => isNearDuplicate(t, best.tokens))) continue
    picked.push(best.text)
    chosenTokens.push(best.tokens)
    bucketCounts[best.bucket]++
  }
  return picked
}
