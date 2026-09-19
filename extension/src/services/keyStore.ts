const STORAGE_KEY = 'groqApiKey'

// chrome.storage.local (not .sync) so the key stays on this device and never
// travels through the user's Google account.
export async function getGroqKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const key = result[STORAGE_KEY]
  return typeof key === 'string' && key.length > 0 ? key : null
}

export function saveGroqKey(key: string): Promise<void> {
  return chrome.storage.local.set({ [STORAGE_KEY]: key })
}

export function clearGroqKey(): Promise<void> {
  return chrome.storage.local.remove(STORAGE_KEY)
}

export function looksLikeGroqKey(key: string): boolean {
  return key.startsWith('gsk_') && key.length >= 30
}

export function maskKey(key: string): string {
  return `gsk_••••${key.slice(-4)}`
}
