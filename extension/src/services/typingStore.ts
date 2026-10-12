// "Learn from what I type" — opt-in, on-device only.
//
// Finished messages the user types into text boxes are kept in a small local
// buffer (chrome.storage.local) and never uploaded as a batch. At reply time
// a handful of the most representative ones are merged into the profile's
// writing samples for that single request (see pickReplySamples).
//
// Everything here is best-effort: storage errors resolve to safe defaults and
// nothing throws, so a broken storage area can never break typing or replies.

import { MAX_WRITING_SAMPLES, MAX_WRITING_SAMPLE_LENGTH } from '../../../shared/profile.js'
import { pickRepresentativeSamples } from '../../../shared/styleLearner.js'

export interface LearningSettings {
  enabled: boolean
  // When the user accepted the consent prompt; null until they opt in.
  consentedAt: number | null
  // Hostnames the user turned learning off for (e.g. "mail.google.com").
  disabledHosts: string[]
}

export interface LearnedSample {
  id: string
  text: string
  host: string
  at: number
}

export const DEFAULT_LEARNING_SETTINGS: LearningSettings = {
  enabled: false,
  consentedAt: null,
  disabledHosts: [],
}

// The UI and the capture content script listen to chrome.storage.onChanged on
// SETTINGS_KEY, so this name is part of the contract.
export const SETTINGS_KEY = 'learningSettings'
export const SAMPLES_KEY = 'learnedSamples'
// FIFO: once full, the oldest sample is dropped to make room.
export const MAX_LEARNED_SAMPLES = 100

// --- pure helpers ----------------------------------------------------------

// "https://www.Mail.Google.com:8080/u/0" -> "mail.google.com". Returns '' when
// nothing usable is left.
export function normalizeHost(input: string): string {
  if (typeof input !== 'string') return ''
  let host = input.trim().toLowerCase()
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  host = host.split(/[/?#]/)[0] ?? ''
  host = host.slice(host.lastIndexOf('@') + 1)
  host = host.replace(/:\d+$/, '')
  host = host.replace(/\.+$/, '').replace(/^www\./, '')
  return host
}

// True when `host` is `disabled` itself or one of its subdomains.
function hostMatches(host: string, disabled: string): boolean {
  return host === disabled || host.endsWith(`.${disabled}`)
}

function isHostDisabled(settings: LearningSettings, host: string): boolean {
  return settings.disabledHosts.some((d) => hostMatches(host, d))
}

// Case-, whitespace- and trailing-punctuation-insensitive identity, so "Ok." and
// "ok" count as the same message.
function duplicateKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!?…]+$/, '').trim()
}

// Same flattening sanitizeProfile applies, so a stored sample is sent as typed.
function cleanSample(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim()
}

function sanitizeSettings(raw: unknown): LearningSettings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const hosts = Array.isArray(input.disabledHosts)
    ? input.disabledHosts
        .filter((h): h is string => typeof h === 'string')
        .map(normalizeHost)
        .filter((h) => h.length > 0)
    : []
  return {
    enabled: input.enabled === true,
    consentedAt:
      typeof input.consentedAt === 'number' && Number.isFinite(input.consentedAt) ? input.consentedAt : null,
    disabledHosts: [...new Set(hosts)],
  }
}

function sanitizeSamples(raw: unknown): LearnedSample[] {
  if (!Array.isArray(raw)) return []
  const out: LearnedSample[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const s = item as Record<string, unknown>
    if (typeof s.id !== 'string' || typeof s.text !== 'string' || s.text.trim().length === 0) continue
    out.push({
      id: s.id,
      text: s.text,
      host: typeof s.host === 'string' ? s.host : '',
      at: typeof s.at === 'number' && Number.isFinite(s.at) ? s.at : 0,
    })
  }
  return out
}

// --- storage ---------------------------------------------------------------

async function readSettings(): Promise<LearningSettings> {
  try {
    const result = await chrome.storage.local.get(SETTINGS_KEY)
    return sanitizeSettings(result[SETTINGS_KEY])
  } catch {
    return { ...DEFAULT_LEARNING_SETTINGS, disabledHosts: [] }
  }
}

// Returns the settings now in effect: the new ones when the write succeeded,
// the unchanged stored ones when it did not.
async function writeSettings(next: LearningSettings): Promise<LearningSettings> {
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next })
    return next
  } catch {
    return readSettings()
  }
}

async function readSamples(): Promise<LearnedSample[]> {
  try {
    const result = await chrome.storage.local.get(SAMPLES_KEY)
    return sanitizeSamples(result[SAMPLES_KEY])
  } catch {
    return []
  }
}

// Read-modify-write on one storage key is not atomic, so writers in this
// context queue behind each other. (Separate tabs are separate contexts; a
// rare lost update there only costs one learned sample.)
let writeQueue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task)
  writeQueue = run.catch(() => undefined)
  return run
}

// --- public API ------------------------------------------------------------

export async function getLearningSettings(): Promise<LearningSettings> {
  return readSettings()
}

// Turning it on stamps consentedAt; turning it off keeps the learned samples
// (the UI offers an explicit delete) but stops all capture immediately.
export async function setLearningEnabled(enabled: boolean): Promise<LearningSettings> {
  return serialized(async () => {
    const current = await readSettings()
    const consentedAt = enabled ? (current.consentedAt ?? Date.now()) : current.consentedAt
    return writeSettings({ ...current, enabled, consentedAt })
  })
}

export async function addDisabledHost(host: string): Promise<LearningSettings> {
  return serialized(async () => {
    const current = await readSettings()
    const normalized = normalizeHost(host)
    if (!normalized || current.disabledHosts.includes(normalized)) return current
    return writeSettings({ ...current, disabledHosts: [...current.disabledHosts, normalized] })
  })
}

export async function removeDisabledHost(host: string): Promise<LearningSettings> {
  return serialized(async () => {
    const current = await readSettings()
    const normalized = normalizeHost(host)
    if (!current.disabledHosts.includes(normalized)) return current
    return writeSettings({
      ...current,
      disabledHosts: current.disabledHosts.filter((h) => h !== normalized),
    })
  })
}

// Returns false when learning is off, the host is disabled, or the text was a
// duplicate (or empty / too long). Callers have already applied
// shared/typingFilter.ts.
export async function addTypedSample(text: string, host: string): Promise<boolean> {
  if (typeof text !== 'string' || typeof host !== 'string') return false
  const cleaned = cleanSample(text)
  // Too-long text is rejected, never truncated: half a message is not a
  // faithful sample of how the user writes.
  if (cleaned.length === 0 || cleaned.length > MAX_WRITING_SAMPLE_LENGTH) return false
  const normalizedHost = normalizeHost(host)
  if (!normalizedHost) return false

  return serialized(async () => {
    try {
      const settings = await readSettings()
      if (!settings.enabled || isHostDisabled(settings, normalizedHost)) return false

      const samples = await readSamples()
      const key = duplicateKey(cleaned)
      if (samples.some((s) => duplicateKey(s.text) === key)) return false

      const sample: LearnedSample = {
        id: crypto.randomUUID(),
        text: cleaned,
        host: normalizedHost,
        at: Date.now(),
      }
      const next = [...samples, sample].slice(-MAX_LEARNED_SAMPLES)
      await chrome.storage.local.set({ [SAMPLES_KEY]: next })
      return true
    } catch {
      return false
    }
  })
}

// Newest first, which is the order the settings list shows them in.
export async function getLearnedSamples(): Promise<LearnedSample[]> {
  const samples = await readSamples()
  return samples.sort((a, b) => b.at - a.at)
}

export async function deleteLearnedSample(id: string): Promise<void> {
  await serialized(async () => {
    try {
      const samples = await readSamples()
      const next = samples.filter((s) => s.id !== id)
      if (next.length !== samples.length) await chrome.storage.local.set({ [SAMPLES_KEY]: next })
    } catch {
      // best-effort
    }
  })
}

export async function clearLearnedSamples(): Promise<void> {
  await serialized(async () => {
    try {
      await chrome.storage.local.remove(SAMPLES_KEY)
    } catch {
      // best-effort
    }
  })
}

// Manual samples (from the profile) win; learned ones fill the remaining
// slots up to MAX_WRITING_SAMPLES. Returns plain strings for the request.
export async function pickReplySamples(manual: string[]): Promise<string[]> {
  const base = Array.isArray(manual) ? manual : []
  try {
    const settings = await readSettings()
    if (!settings.enabled) return manual

    const manualSamples = base.slice(0, MAX_WRITING_SAMPLES)
    const room = MAX_WRITING_SAMPLES - manualSamples.length
    if (room <= 0) return manualSamples

    const manualKeys = new Set(manualSamples.map(duplicateKey))
    // Newest first, so the learner's tie-break prefers recent messages.
    const learned = (await getLearnedSamples())
      .map((s) => s.text)
      .filter((t) => t.length <= MAX_WRITING_SAMPLE_LENGTH && !manualKeys.has(duplicateKey(t)))
    const picked = pickRepresentativeSamples(learned, room, manualSamples)
    return [...manualSamples, ...picked].slice(0, MAX_WRITING_SAMPLES)
  } catch {
    return manual
  }
}
