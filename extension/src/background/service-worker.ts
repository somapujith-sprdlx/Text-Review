import type { QuickImproveDoneMessage, QuickModeSettings, SelectionMessage } from '../types/index'
import { improveText } from '../services/api.js'
import { InvalidKeyError, LimitReachedError } from '../services/errors.js'
import { replaceActiveFieldText } from '../services/insertText.js'

// Cached in memory (not read fresh per-trigger) so the decision to open the
// side panel can stay synchronous within the user-gesture callback — an
// awaited chrome.storage.local.get() first would make chrome.sidePanel.open()
// silently no-op, the same bug fixed for the message-relay path above.
// MV3 service workers restart frequently and lose this cache each time; the
// brief window before the .get() below resolves means a click right after a
// cold start can fall through to opening the panel even if Quick Mode is on.
// Not destructive, just a rare inconsistency — accepted rather than adding
// synchronous storage access the platform doesn't provide.
let cachedQuickMode: QuickModeSettings | undefined

chrome.storage.local.get('quickMode').then((result) => {
  cachedQuickMode = result.quickMode as QuickModeSettings | undefined
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.quickMode) {
    cachedQuickMode = changes.quickMode.newValue as QuickModeSettings | undefined
  }
})

function openPanelWithSelection(tabId: number, text: string) {
  // chrome.sidePanel.open() must run synchronously within the user-gesture
  // callback (the onMessage/onClicked handler itself) or Chrome silently
  // drops it — so it's called first, before the async storage write.
  chrome.sidePanel.open({ tabId })
  chrome.storage.session.set({ pendingSelection: text })
}

async function quickImprove(tabId: number, text: string, styleId: string) {
  let ok = false
  let reason: QuickImproveDoneMessage['reason']
  try {
    const result = await improveText({ text, style: styleId })
    await chrome.scripting.executeScript({
      target: { tabId },
      func: replaceActiveFieldText,
      args: [result.outputText],
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

function handleTrigger(tabId: number, text: string, forcePanel = false) {
  if (!forcePanel && cachedQuickMode?.enabled) {
    quickImprove(tabId, text, cachedQuickMode.styleId)
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

  handleTrigger(tabId, message.text, message.forcePanel)
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

  handleTrigger(tab.id, info.selectionText)
})
