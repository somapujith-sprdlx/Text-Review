// Chrome can kill an MV3 background service worker mid-request with no
// warning (its service workers are terminated aggressively once Chrome
// decides they're idle or have run too long), silently abandoning whatever
// fetch was in flight. With no timeout, the caller's promise just never
// settles — for Quick Mode that means the floating button's "Improving…"
// spinner is stuck forever, since it can't be dismissed until a result
// arrives. Aborting proactively turns that silent hang into an ordinary
// rejected fetch the caller already knows how to handle.
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
