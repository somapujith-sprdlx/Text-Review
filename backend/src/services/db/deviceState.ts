import { getSql } from './client.js'
import { RATING_GATE_THRESHOLD } from '../../../../shared/rating.js'
import type { Identity } from '../../lib/identity.js'

export interface DeviceStateRow {
  lifetimeImprovements: number
  onboardingCompleted: boolean
  ratingRequired: boolean
  googleLinked: boolean
  email: string | null
}

interface RawRow {
  lifetime_improvements: number
  onboarding_completed_at: string | null
  rating_claimed_at: string | null
  google_sub: string | null
  email: string | null
}

// A Neon outage (or DATABASE_URL simply not being configured, e.g. local
// dev) must not take the product down — every function below fails open to
// this default rather than throwing, same philosophy as usageLimit.ts's
// in-memory fallback when USAGE_KV isn't bound.
const DEFAULT_STATE: DeviceStateRow = {
  lifetimeImprovements: 0,
  onboardingCompleted: false,
  ratingRequired: false,
  googleLinked: false,
  email: null,
}

const RETURNING = 'lifetime_improvements, onboarding_completed_at, rating_claimed_at, google_sub, email'

function toRow(row: RawRow): DeviceStateRow {
  return {
    lifetimeImprovements: row.lifetime_improvements,
    onboardingCompleted: row.onboarding_completed_at !== null,
    ratingRequired: row.lifetime_improvements >= RATING_GATE_THRESHOLD && row.rating_claimed_at === null,
    googleLinked: row.google_sub !== null,
    email: row.email,
  }
}

// Google identities are only ever looked up, never inserted, by these four
// functions — linkGoogleAccount() below is the single place a google_sub
// gets attached to a row, and it always runs before any of these can be
// called with a 'google' identity. A plain SELECT/UPDATE with no matching
// row (shouldn't happen given that invariant, but not impossible if it's
// ever violated) falls through to DEFAULT_STATE, same as any other failure.
export async function getDeviceState(identity: Identity): Promise<DeviceStateRow> {
  const sql = getSql()
  if (!sql) return DEFAULT_STATE
  try {
    const column = identity.kind === 'device' ? 'device_id' : 'google_sub'
    const rows = (await sql.query(`SELECT ${RETURNING} FROM device_state WHERE ${column} = $1`, [
      identity.key,
    ])) as RawRow[]
    return rows.length > 0 ? toRow(rows[0]) : DEFAULT_STATE
  } catch (err) {
    console.error('getDeviceState failed:', err)
    return DEFAULT_STATE
  }
}

// Atomic upsert-increment for the device-id path — RETURNING makes this
// race-free, unlike the KV-backed daily counter in usageLimit.ts (documented
// read-then-write race there, accepted as a soft limit; this one doesn't
// need that tradeoff). The google_sub path is a plain UPDATE, not an
// upsert — see the comment above.
export async function incrementLifetimeImprovements(identity: Identity): Promise<DeviceStateRow> {
  const sql = getSql()
  if (!sql) return DEFAULT_STATE
  try {
    const rows = (await sql.query(
      identity.kind === 'device'
        ? `INSERT INTO device_state (device_id, lifetime_improvements, updated_at)
           VALUES ($1, 1, now())
           ON CONFLICT (device_id) DO UPDATE
             SET lifetime_improvements = device_state.lifetime_improvements + 1, updated_at = now()
           RETURNING ${RETURNING}`
        : `UPDATE device_state SET lifetime_improvements = lifetime_improvements + 1, updated_at = now()
           WHERE google_sub = $1
           RETURNING ${RETURNING}`,
      [identity.key],
    )) as RawRow[]
    return rows.length > 0 ? toRow(rows[0]) : DEFAULT_STATE
  } catch (err) {
    console.error('incrementLifetimeImprovements failed:', err)
    return DEFAULT_STATE
  }
}

export async function markOnboardingComplete(identity: Identity): Promise<DeviceStateRow> {
  const sql = getSql()
  if (!sql) return DEFAULT_STATE
  try {
    const rows = (await sql.query(
      identity.kind === 'device'
        ? `INSERT INTO device_state (device_id, onboarding_completed_at, updated_at)
           VALUES ($1, now(), now())
           ON CONFLICT (device_id) DO UPDATE
             SET onboarding_completed_at = COALESCE(device_state.onboarding_completed_at, now()), updated_at = now()
           RETURNING ${RETURNING}`
        : `UPDATE device_state SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()), updated_at = now()
           WHERE google_sub = $1
           RETURNING ${RETURNING}`,
      [identity.key],
    )) as RawRow[]
    return rows.length > 0 ? toRow(rows[0]) : DEFAULT_STATE
  } catch (err) {
    console.error('markOnboardingComplete failed:', err)
    return DEFAULT_STATE
  }
}

// One-way flag: once set, COALESCE keeps the original timestamp on every
// later call, so ratingRequired can never flip back to true for this
// identity — device or google alike.
export async function markRatingClaimed(identity: Identity): Promise<DeviceStateRow> {
  const sql = getSql()
  if (!sql) return DEFAULT_STATE
  try {
    const rows = (await sql.query(
      identity.kind === 'device'
        ? `INSERT INTO device_state (device_id, rating_prompted_at, rating_claimed_at, updated_at)
           VALUES ($1, now(), now(), now())
           ON CONFLICT (device_id) DO UPDATE
             SET rating_claimed_at = COALESCE(device_state.rating_claimed_at, now()), updated_at = now()
           RETURNING ${RETURNING}`
        : `UPDATE device_state SET rating_prompted_at = COALESCE(rating_prompted_at, now()),
             rating_claimed_at = COALESCE(rating_claimed_at, now()), updated_at = now()
           WHERE google_sub = $1
           RETURNING ${RETURNING}`,
      [identity.key],
    )) as RawRow[]
    return rows.length > 0 ? toRow(rows[0]) : DEFAULT_STATE
  } catch (err) {
    console.error('markRatingClaimed failed:', err)
    return DEFAULT_STATE
  }
}

// Links a verified Google identity to this device's progress. If that
// google_sub is already linked to a different (older) row — e.g. the same
// person signing in again after a reinstall gave them a new device_id —
// that existing row is authoritative and is returned as-is, untouched;
// otherwise the current device_id's row gains the google_sub/email so its
// already-at-the-threshold progress becomes tied to the account from here on.
export async function linkGoogleAccount(deviceId: string, sub: string, email: string): Promise<DeviceStateRow> {
  const sql = getSql()
  if (!sql) return DEFAULT_STATE
  try {
    const existing = (await sql.query(`SELECT ${RETURNING} FROM device_state WHERE google_sub = $1`, [
      sub,
    ])) as RawRow[]
    if (existing.length > 0) return toRow(existing[0])

    const rows = (await sql.query(
      `INSERT INTO device_state (device_id, google_sub, email, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (device_id) DO UPDATE
         SET google_sub = $2, email = $3, updated_at = now()
       RETURNING ${RETURNING}`,
      [deviceId, sub, email],
    )) as RawRow[]
    return rows.length > 0 ? toRow(rows[0]) : DEFAULT_STATE
  } catch (err) {
    console.error('linkGoogleAccount failed:', err)
    return DEFAULT_STATE
  }
}
