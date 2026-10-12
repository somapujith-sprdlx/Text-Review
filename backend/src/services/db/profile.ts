import { getSql } from './client.js'
import { DEFAULT_PROFILE, sanitizeProfile, type WritingProfile } from '../../../../shared/profile.js'

interface RawProfileRow {
  tone: string
  verbosity: string
  emoji_usage: string
  custom_instructions: string
  // jsonb: the driver hands back a parsed array, but a hand-edited row could
  // hold anything, so it is only ever read through sanitizeProfile.
  writing_samples: unknown
}

const PROFILE_COLUMNS = 'tone, verbosity, emoji_usage, custom_instructions, writing_samples'

// Rows go through sanitizeProfile on the way out as well as on the way in:
// the table is plain text columns, so a hand-edited or stale value must never
// reach buildPrompt as an unknown enum.
// jsonb normally arrives already parsed; accept a JSON string too so a driver
// or a hand-written row can't turn the samples into silent data loss.
function parseSamples(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

function toProfile(row: RawProfileRow): WritingProfile {
  return sanitizeProfile({
    tone: row.tone,
    verbosity: row.verbosity,
    emojiUsage: row.emoji_usage,
    customInstructions: row.custom_instructions,
    writingSamples: parseSamples(row.writing_samples),
  })
}

// Fail-open, same philosophy as deviceState.ts: no DATABASE_URL, no row, or a
// Neon outage all yield "no preferences" rather than an error.
export async function getProfile(googleSub: string): Promise<WritingProfile> {
  const sql = getSql()
  if (!sql) return DEFAULT_PROFILE
  try {
    const rows = (await sql.query(
      `SELECT ${PROFILE_COLUMNS} FROM user_profiles WHERE google_sub = $1`,
      [googleSub],
    )) as RawProfileRow[]
    return rows.length > 0 ? toProfile(rows[0]) : DEFAULT_PROFILE
  } catch (err) {
    console.error('getProfile failed:', err)
    return DEFAULT_PROFILE
  }
}

// Unlike every read above, a failed save must be visible: returns null so the
// route can tell the user their preferences were NOT stored, instead of the
// extension caching a profile the server never persisted.
export async function saveProfile(googleSub: string, profile: unknown): Promise<WritingProfile | null> {
  const sql = getSql()
  if (!sql) return null
  const clean = sanitizeProfile(profile)
  try {
    const rows = (await sql.query(
      `INSERT INTO user_profiles (google_sub, tone, verbosity, emoji_usage, custom_instructions, writing_samples, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
       ON CONFLICT (google_sub) DO UPDATE
         SET tone = EXCLUDED.tone,
             verbosity = EXCLUDED.verbosity,
             emoji_usage = EXCLUDED.emoji_usage,
             custom_instructions = EXCLUDED.custom_instructions,
             writing_samples = EXCLUDED.writing_samples,
             updated_at = now()
       RETURNING ${PROFILE_COLUMNS}`,
      [
        googleSub,
        clean.tone,
        clean.verbosity,
        clean.emojiUsage,
        clean.customInstructions,
        JSON.stringify(clean.writingSamples),
      ],
    )) as RawProfileRow[]
    return rows.length > 0 ? toProfile(rows[0]) : null
  } catch (err) {
    console.error('saveProfile failed:', err)
    return null
  }
}
