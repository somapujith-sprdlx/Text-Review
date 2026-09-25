import type { UsageInfo } from '../types/index.js'

export interface CachedUsage extends UsageInfo {
  date: string
}

const STORAGE_KEY = 'usageCache'

// UTC day, matching the backend's daily-reset key (see usageLimit.ts dayKey).
function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

// Persisted after every backend-routed response (success or limit error) so
// the background script can tell, without another network round trip,
// whether today's free allowance is already spent — needed to open the side
// panel synchronously within the click that triggered it (see service-worker.ts).
export function saveUsageCache(usage: UsageInfo): Promise<void> {
  const cached: CachedUsage = { ...usage, date: todayKey() }
  return chrome.storage.local.set({ [STORAGE_KEY]: cached })
}

export function isLimitReached(cached: CachedUsage | undefined): boolean {
  return !!cached && cached.date === todayKey() && cached.used >= cached.limit
}
