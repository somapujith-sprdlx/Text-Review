import type { QuickImproveDoneMessage, QuickModeSettings, SelectionMessage } from '../types/index'

let floatingButton: HTMLButtonElement | null = null
let isProcessing = false
// 'setup' = Quick Mode hit the free limit and the button now leads to the Groq-key setup.
let buttonMode: 'improve' | 'setup' = 'improve'

function removeFloatingButton() {
  if (isProcessing) return
  floatingButton?.remove()
  floatingButton = null
}

function setButtonProcessing(button: HTMLButtonElement) {
  isProcessing = true
  button.disabled = true
  button.style.cursor = 'wait'
  button.style.opacity = '0.85'
  button.textContent = '⏳ Improving…'
}

function offerKeySetup(button: HTMLButtonElement, reason: 'limit' | 'key') {
  isProcessing = false
  buttonMode = 'setup'
  button.disabled = false
  button.style.cursor = 'pointer'
  button.style.opacity = '1'
  button.style.background = '#C6A15B'
  button.style.color = '#07281E'
  button.textContent =
    reason === 'limit' ? '🔑 Free limit reached — add your Groq key' : '🔑 Groq key rejected — add a new one'
  setTimeout(() => {
    if (floatingButton === button && buttonMode === 'setup') removeFloatingButton()
  }, 10_000)
}

function flashButtonError(button: HTMLButtonElement) {
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
}

chrome.runtime.onMessage.addListener((message: QuickImproveDoneMessage) => {
  if (message?.type !== 'QUICK_IMPROVE_DONE') return
  if (!floatingButton) return

  if (message.ok) {
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
  if (e.target !== floatingButton) {
    removeFloatingButton()
  }
})

document.addEventListener('mouseup', () => {
  isMouseDown = false
  evaluateSelection()
})
