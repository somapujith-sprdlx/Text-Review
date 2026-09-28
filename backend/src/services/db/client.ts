import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// nodejs_compat (see wrangler.toml) populates process.env from Worker vars
// and secrets, the same way GROQ_API_KEY(S) is read in keyPool.ts — so this
// works identically in production and in local `wrangler dev`/node dev.
// Returns null when unset (e.g. a dev machine without DATABASE_URL
// configured) so callers can fail open instead of crashing.
let cached: NeonQueryFunction<false, false> | null | undefined

export function getSql(): NeonQueryFunction<false, false> | null {
  if (cached !== undefined) return cached
  const url = process.env.DATABASE_URL
  cached = url ? neon(url) : null
  return cached
}
