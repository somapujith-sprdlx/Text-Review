import type { QuickImproveDoneMessage, QuickModeSettings, SelectionMessage } from '../types/index'

// The last editable element (composer / reply box) the user focused. The
// selected message is usually NOT editable and clicking Reply moves focus
// away, so insertReplyText() (services/insertReply.ts, injected into this same
// isolated world) falls back to this to find where to put the reply.
declare global {
  interface Window {
    __lipiLastEditable?: HTMLElement
  }
}

let floatingButton: HTMLButtonElement | null = null
// Sits next to the improve button for the same selection; gone whenever the
// improve button is, or once the improve button turns into a status display.
let replyButton: HTMLButtonElement | null = null
let isProcessing = false
// 'setup' = Quick Mode hit the free limit and the button now leads to the Groq-key setup.
let buttonMode: 'improve' | 'setup' = 'improve'
// isProcessing blocks the button from ever being dismissed, so if the
// service worker's QUICK_IMPROVE_DONE message never arrives — e.g. Chrome
// killed the MV3 service worker mid-request, which it can do with no
// warning — the button would otherwise be stuck on "Improving…" forever.
// This is the backstop; the normal path clears it long before it fires.
const processingTimeouts = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>()
const PROCESSING_TIMEOUT_MS = 35_000

function removeReplyButton() {
  replyButton?.remove()
  replyButton = null
}

function removeFloatingButton() {
  removeReplyButton()
  if (isProcessing) return
  floatingButton?.remove()
  floatingButton = null
}

function setButtonProcessing(button: HTMLButtonElement) {
  removeReplyButton()
  isProcessing = true
  button.disabled = true
  button.style.cursor = 'wait'
  button.style.opacity = '0.85'
  button.textContent = '⏳ Improving…'

  const timeoutId = setTimeout(() => {
    isProcessing = false
    button.textContent = '⚠️ Timed out — try again'
    button.style.background = '#B91C1C'
    button.style.opacity = '1'
    setTimeout(() => {
      button.remove()
      if (floatingButton === button) floatingButton = null
    }, 1600)
  }, PROCESSING_TIMEOUT_MS)
  processingTimeouts.set(button, timeoutId)
}

function clearProcessingTimeout(button: HTMLButtonElement) {
  const timeoutId = processingTimeouts.get(button)
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId)
    processingTimeouts.delete(button)
  }
}

function offerKeySetup(button: HTMLButtonElement, reason: 'limit' | 'key') {
  removeReplyButton()
  clearProcessingTimeout(button)
  isProcessing = false
  buttonMode = 'setup'
  button.disabled = false
  button.style.cursor = 'pointer'
  button.style.opacity = '1'
  button.style.background = '#C6A15B'
  button.style.color = '#07281E'
  button.textContent =
    reason === 'limit' ? '🔑 Limit reached today — add your Groq key' : '🔑 Groq key rejected — add a new one'
  setTimeout(() => {
    if (floatingButton === button && buttonMode === 'setup') removeFloatingButton()
  }, 10_000)
}

function flashButtonError(button: HTMLButtonElement) {
  clearProcessingTimeout(button)
  button.textContent = '⚠️ Failed — try again'
  button.style.background = '#B91C1C'
  setTimeout(() => {
    isProcessing = false
    removeFloatingButton()
  }, 1600)
}

function showFloatingButton(selectionText: string, rect: DOMRect) {
  removeFloatingButton()
  buttonMode = 'improve'

  const button = document.createElement('button')
  button.textContent = '✨ Improve Text'
  button.style.position = 'fixed'
  button.style.top = `${Math.max(rect.top - 36, 4)}px`
  button.style.left = `${rect.left}px`
  button.style.zIndex = '2147483647'
  button.style.padding = '6px 10px'
  button.style.borderRadius = '6px'
  button.style.border = 'none'
  button.style.background = '#0B3D2E'
  button.style.color = '#fff'
  button.style.fontSize = '13px'
  button.style.cursor = 'pointer'
  button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'

  button.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const forcePanel = buttonMode === 'setup'
    const message: SelectionMessage = { type: 'OPEN_SIDE_PANEL_WITH_SELECTION', text: selectionText, forcePanel }
    chrome.runtime.sendMessage(message).catch((err) => {
      console.error('Text Quality Enhancer: failed to reach the extension background script.', err)
    })

    // In Quick Mode the service worker processes the request in the
    // background with no panel to show progress in — keep the button
    // visible as a spinner instead of removing it immediately, so the
    // click has some visible effect rather than looking like nothing
    // happened. Non-Quick-Mode clicks still remove it right away, since
    // the side panel opening is itself the feedback.
    if (forcePanel) {
      removeFloatingButton()
      return
    }

    chrome.storage.local.get('quickMode').then((result) => {
      const quickMode = result.quickMode as QuickModeSettings | undefined
      if (quickMode?.enabled && floatingButton === button) {
        setButtonProcessing(button)
      } else {
        removeFloatingButton()
      }
    })
  })

  document.body.appendChild(button)
  floatingButton = button
  showReplyButton(selectionText, button)
}

function showReplyButton(selectionText: string, improveButton: HTMLButtonElement) {
  const button = document.createElement('button')
  button.textContent = '💬 Reply'
  button.style.position = 'fixed'
  button.style.top = improveButton.style.top
  button.style.zIndex = '2147483647'
  button.style.padding = '6px 10px'
  button.style.borderRadius = '6px'
  button.style.border = 'none'
  button.style.background = '#0B3D2E'
  button.style.color = '#fff'
  button.style.fontSize = '13px'
  button.style.cursor = 'pointer'
  button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'

  // Same handling as the improve button: act on mousedown (and swallow it) so
  // the page's selection and focus — and with it the composer we may need to
  // insert into later — are left alone.
  button.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const message: SelectionMessage = { type: 'OPEN_SIDE_PANEL_WITH_SELECTION', text: selectionText, mode: 'reply' }
    chrome.runtime.sendMessage(message).catch((err) => {
      console.error('Text Quality Enhancer: failed to reach the extension background script.', err)
    })
    // Reply always opens the side panel, which is itself the feedback.
    removeFloatingButton()
  })

  document.body.appendChild(button)

  // Right of the improve button; flipped to its left if that would run off
  // the viewport edge. Measured after insertion since widths depend on text.
  const improveRect = improveButton.getBoundingClientRect()
  const width = button.getBoundingClientRect().width
  let left = improveRect.right + 6
  if (left + width > window.innerWidth - 4) left = Math.max(improveRect.left - width - 6, 4)
  button.style.left = `${left}px`
  replyButton = button
}

chrome.runtime.onMessage.addListener((message: QuickImproveDoneMessage) => {
  if (message?.type !== 'QUICK_IMPROVE_DONE') return
  if (!floatingButton) return

  if (message.ok) {
    clearProcessingTimeout(floatingButton)
    isProcessing = false
    removeFloatingButton()
  } else if (message.reason === 'limit' || message.reason === 'key') {
    offerKeySetup(floatingButton, message.reason)
  } else {
    flashButtonError(floatingButton)
  }
})

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return ['text', 'search', 'email', 'url', 'tel'].includes(type)
  }
  return false
}

function evaluateSelection() {
  const active = document.activeElement

  // window.getSelection() only sees selections in regular page content and
  // contenteditable elements — it does NOT see text selected inside an
  // <input>/<textarea>, which tracks its own selectionStart/selectionEnd
  // instead. Without this branch, selecting text inside any form field
  // never showed the floating button at all. The field's own bounding rect
  // is used for positioning (an approximation — pinpointing just the
  // selected substring's rect would need canvas-based text measurement).
  if (isTextField(active)) {
    const start = active.selectionStart ?? 0
    const end = active.selectionEnd ?? 0
    if (start === end) {
      removeFloatingButton()
      return
    }
    const text = active.value.slice(start, end).trim()
    if (!text) {
      removeFloatingButton()
      return
    }
    showFloatingButton(text, active.getBoundingClientRect())
    return
  }

  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''

  if (!text || !selection || selection.rangeCount === 0) {
    removeFloatingButton()
    return
  }

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    removeFloatingButton()
    return
  }

  showFloatingButton(text, rect)
}

let isMouseDown = false

// selectionchange fires continuously while dragging, and the range's
// bounding rect can be transiently zero-size mid-drag (e.g. right after the
// first character is selected, before the drag has covered any width) —
// evaluating on every firing intermittently removed the button and never
// recreated it if a later firing didn't land cleanly. Only evaluate once
// the drag ends (mouseup) or on a keyboard-driven change (mouse not down).
document.addEventListener('selectionchange', () => {
  if (isMouseDown) return
  evaluateSelection()
})

document.addEventListener('mousedown', (e) => {
  isMouseDown = true
  if (e.target !== floatingButton && e.target !== replyButton) {
    removeFloatingButton()
  }
})

document.addEventListener('mouseup', () => {
  isMouseDown = false
  evaluateSelection()
})

// Records the last editable the user focused (see Window.__lipiLastEditable).
// composedPath()[0] reaches through open shadow roots to the real target.
// Capture phase so pages that stop propagation can't hide a focus from us.
function isEditableTarget(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el === floatingButton || el === replyButton) return false
  if (el.tagName === 'TEXTAREA') {
    const t = el as HTMLTextAreaElement
    return !t.disabled && !t.readOnly
  }
  if (el.tagName === 'INPUT') {
    const i = el as HTMLInputElement
    return !i.disabled && !i.readOnly && ['text', 'search', 'email', 'url', 'tel'].includes(i.type)
  }
  return el.isContentEditable
}

document.addEventListener(
  'focusin',
  (e) => {
    const target = e.composedPath()[0]
    if (target instanceof Element && isEditableTarget(target)) {
      window.__lipiLastEditable = target
    }
  },
  true,
)
