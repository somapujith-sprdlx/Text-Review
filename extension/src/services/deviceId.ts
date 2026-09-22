const STORAGE_KEY = 'deviceId'

// A random per-install id — not tied to identity — so the backend can track
// the free allowance per device instead of per IP, which false-shares the
// limit across everyone on the same network (offices, cafes, mobile NAT).
export async function getDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const existing = result[STORAGE_KEY]
  if (typeof existing === 'string' && existing.length > 0) return existing

  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [STORAGE_KEY]: id })
  return id
}
