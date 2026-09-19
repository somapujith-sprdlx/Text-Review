// Injected into the page via chrome.scripting.executeScript — must be a
// fully self-contained function (no closures over outer scope), since it
// runs in the page's isolated world, not this module's.
//
// Returns true when the text was written into an editable field, false when
// there was nothing editable focused and it only went to the clipboard.
export function replaceActiveFieldText(text: string): boolean {
  const active = document.activeElement as HTMLElement | null

  if (
    active &&
    (active.tagName === 'TEXTAREA' ||
      (active.tagName === 'INPUT' &&
        ['text', 'search', 'email', 'url', 'tel'].includes((active as HTMLInputElement).type)))
  ) {
    ;(active as HTMLTextAreaElement | HTMLInputElement).value = text
    active.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }

  if (active && active.isContentEditable) {
    active.textContent = text
    active.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }

  navigator.clipboard.writeText(text)
  return false
}
