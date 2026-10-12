export type InsertReplyResult = 'inserted' | 'no-target'

// Injected into the page with
//   chrome.scripting.executeScript({ target: { tabId }, func: insertReplyText, args: [text] })
// so it MUST stay fully self-contained: no imports or outer variables are
// available inside the page, only the serialized function body is sent. It
// must run in the default ISOLATED world — that is where the content script
// records window.__lipiLastEditable (see content/selection.ts).
//
// Puts `text` into the reply box the way a user typing would, and never
// submits. The target is the focused editable if there is one, otherwise the
// last editable the content script saw focused — necessary because the
// selected message is rarely editable and clicking Reply / the side panel
// moves focus away from the composer. Text is appended after any draft already
// in the box rather than replacing it.
export function insertReplyText(text: string): InsertReplyResult {
  const TEXT_INPUT_TYPES = ['text', 'search', 'email', 'url', 'tel']

  const isEditable = (el: Element | null | undefined): el is HTMLElement => {
    if (!el || !(el instanceof HTMLElement)) return false
    if (el.tagName === 'TEXTAREA') {
      const t = el as HTMLTextAreaElement
      return !t.disabled && !t.readOnly
    }
    if (el.tagName === 'INPUT') {
      const i = el as HTMLInputElement
      return !i.disabled && !i.readOnly && TEXT_INPUT_TYPES.includes(i.type)
    }
    return el.isContentEditable
  }

  const last = (window as unknown as { __lipiLastEditable?: HTMLElement }).__lipiLastEditable
  let target: HTMLElement | null = null
  if (isEditable(document.activeElement)) {
    target = document.activeElement
  } else if (last && last.isConnected && isEditable(last)) {
    target = last
  }
  if (!target) return 'no-target'

  target.focus()

  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
    const field = target as HTMLInputElement | HTMLTextAreaElement
    const existing = field.value
    const next = existing && !/\s$/.test(existing) ? `${existing} ${text}` : `${existing}${text}`
    // Frameworks such as React track the value on the element instance and
    // ignore a plain `el.value = …`, so write through the prototype's setter.
    const proto = target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setValue = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (!setValue) return 'no-target'
    setValue.call(field, next)
    try {
      field.setSelectionRange(next.length, next.length)
    } catch {
      // some input types don't support selection ranges — not needed
    }
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    return 'inserted'
  }

  // contenteditable: caret to the end (after any existing draft), then type
  // the text in through the editing pipeline so the page's editor sees a
  // normal beforeinput/input sequence.
  const existingText = target.textContent ?? ''
  const toInsert = existingText && !/\s$/.test(existingText) ? ` ${text}` : text

  const selection = window.getSelection()
  if (selection) {
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  let ok = false
  try {
    ok = document.execCommand('insertText', false, toInsert)
  } catch {
    ok = false
  }
  if (ok) return 'inserted'

  // Fallback: raw Range insert. Editors that keep their own document model may
  // ignore it, but plain contenteditable and simple editors pick up the event.
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 'no-target'
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(toInsert)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: toInsert }))
  return 'inserted'
}
