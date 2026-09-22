// Multiple Groq keys for the shared free tier, so one key's rate limit
// doesn't become everyone's limit. GROQ_API_KEYS is comma- or
// newline-separated; GROQ_API_KEY (singular) still works as a one-key pool.
function parseKeys(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean)
}

export function getGroqKeys(): string[] {
  const multi = parseKeys(process.env.GROQ_API_KEYS)
  if (multi.length > 0) return multi

  const single = process.env.GROQ_API_KEY?.trim()
  return single ? [single] : []
}
