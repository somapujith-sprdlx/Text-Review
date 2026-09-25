import type { QuickImproveDoneMessage, QuickModeSettings, SelectionMessage } from '../types/index'
import { improveText } from '../services/api.js'
import { InvalidKeyError, LimitReachedError } from '../services/errors.js'
import { replaceSelectionText } from '../services/insertText.js'
import { isLimitReached, type CachedUsage } from '../services/usageCache.js'

// Cached in memory (not read fresh per-trigger) so the decision to open the
// side panel can stay synchronous within the user-gesture callback — an
// awaited chrome.storage.local.get() first would make chrome.sidePanel.open()
// silently no-op, the same bug fixed for the message-relay path above.
// MV3 service workers restart frequently and lose this cache each time; the
// brief window before the .get() below resolves means a click right after a
// cold start can fall through to opening the panel even if Quick Mode is on.
// Not destructive, just a rare inconsistency — accepted rather than adding
// synchronous storage access the platform doesn't provide. Quick Mode is on
// by default, so an unresolved cache falls back to enabled rather than to
// opening the panel.
let cachedQuickMode: QuickModeSettings | undefined
const DEFAULT_QUICK_MODE: QuickModeSettings = { enabled: true, styleId: 'improve' }
let cachedHasKey = false
let cachedUsage: CachedUsage | undefined

chrome.storage.local.get(['quickMode', 'groqApiKey', 'usageCache']).then((result) => {
  cachedQuickMode = result.quickMode as QuickModeSettings | undefined
  cachedHasKey = typeof result.groqApiKey === 'string' && result.groqApiKey.length > 0
  cachedUsage = result.usageCache as CachedUsage | undefined
})

// Runs on every install AND every update (including the repeated "reload
// unpacked extension" cycle during development, which Chrome reports as
// 'update') — otherwise anyone who had the extension before Quick Mode
// shipped (or reloaded it while iterating) would have no quickMode value in
// storage, ever, and default to the side panel forever. The inner check is
// what actually protects an installed user's own choice, including turning
// Quick Mode off, from being overwritten.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('quickMode').then((result) => {
    if (result.quickMode !== undefined) return
    cachedQuickMode = DEFAULT_QUICK_MODE
    chrome.storage.local.set({ quickMode: DEFAULT_QUICK_MODE })
  })
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  if (changes.quickMode) cachedQuickMode = changes.quickMode.newValue as QuickModeSettings | undefined
  if (changes.groqApiKey) {
    const next = changes.groqApiKey.newValue
    cachedHasKey = typeof next === 'string' && next.length > 0
  }
  if (changes.usageCache) cachedUsage = changes.usageCache.newValue as CachedUsage | undefined
})

function openPanelWithSelection(tabId: number, text: string, limitReached = false) {
  // chrome.sidePanel.open() must run synchronously within the user-gesture
  // callback (the onMessage/onClicked handler itself) or Chrome silently
  // drops it — so it's called first, before the async storage write.
  chrome.sidePanel.open({ tabId })
  // Always set both keys (not a conditional shape) so every write has the
  // same object type, and so a stale `true` from an earlier limit-triggered
  // open can never linger for a later, ordinary selection.
  chrome.storage.session.set({ pendingSelection: text, pendingLimitReached: limitReached })
}

async function quickImprove(tabId: number, text: string, styleId: string) {
  let ok = false
  let reason: QuickImproveDoneMessage['reason']
  try {
    const result = await improveText({ text, style: styleId })
    await chrome.scripting.executeScript({
      target: { tabId },
      func: replaceSelectionText,
      args: [result.outputText, text],
    })
    ok = true
  } catch (err) {
    reason = err instanceof LimitReachedError ? 'limit' : err instanceof InvalidKeyError ? 'key' : 'error'
    // Quick Mode has no in-page UI to surface a detailed error in — the
    // floating button just stops its spinner and briefly flashes red (see
    // content script) — but still log server-side (console) so a failed
    // run is diagnosable. err.cause carries the real network/fetch error
    // api.ts wraps away behind the generic user-facing message.
    console.error(
      'Text Quality Enhancer: Quick Mode improve failed.',
      err,
      err instanceof Error ? err.cause : undefined,
    )
  }

  const doneMessage: QuickImproveDoneMessage = { type: 'QUICK_IMPROVE_DONE', ok, reason }
  chrome.tabs.sendMessage(tabId, doneMessage).catch(() => {
    // The content script may have been torn down (navigation, tab closed)
    // before this arrived — nothing to update in that case, safe to ignore.
  })
}

// Quick Mode writes its result back by injecting a script into the tab, which
// Chrome refuses on chrome://, chrome-extension://, about: and similar pages
// ("Cannot access a chrome:// URL"). tab.url is only populated for pages the
// extension has host access to, so a missing URL means "not injectable" too.
function canInjectInto(tabUrl: string | undefined): boolean {
  return tabUrl !== undefined && /^https?:\/\//.test(tabUrl)
}

function handleTrigger(tabId: number, text: string, tabUrl: string | undefined, forcePanel = false) {
  const quickModeEnabled = cachedQuickMode?.enabled ?? DEFAULT_QUICK_MODE.enabled

  // Checked before calling the API, so a page we can't write back to doesn't
  // burn a request — the side panel handles it instead (and still offers Copy).
  if (!forcePanel && quickModeEnabled && canInjectInto(tabUrl)) {
    // Already known, from an earlier request today, that the free allowance
    // is spent — skip the network round trip (which would just 429 again)
    // and open the panel with the limit prompt right away, synchronously
    // within this click, instead of needing a second click on the floating
    // button once quickImprove() below finds out asynchronously.
    if (!cachedHasKey && isLimitReached(cachedUsage)) {
      openPanelWithSelection(tabId, text, true)
      return
    }
    quickImprove(tabId, text, cachedQuickMode?.styleId ?? DEFAULT_QUICK_MODE.styleId)
    return
  }

  openPanelWithSelection(tabId, text)
}

chrome.runtime.onMessage.addListener((message: SelectionMessage, sender) => {
  if (message?.type !== 'OPEN_SIDE_PANEL_WITH_SELECTION') {
    return
  }

  const tabId = sender.tab?.id
  if (tabId === undefined) {
    return
  }

  handleTrigger(tabId, message.text, sender.tab?.url, message.forcePanel)
})

// The service worker re-executes this top-level code on every cold start
// (MV3 workers are killed and restarted often), but a menu item created in
// a previous life of the worker persists in Chrome regardless — so create()
// with the same id throws "duplicate id" on every restart after the first.
// removeAll() first makes this idempotent no matter how many times it runs.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'improve-text-with',
    title: 'Improve Text with...',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'improve-text-with' || !tab?.id || !info.selectionText) {
    return
  }

  handleTrigger(tab.id, info.selectionText, tab.url)
})
