// Injected into the page via chrome.scripting.executeScript — must be a
// fully self-contained function (no closures over outer scope, no imports
// used inside), since it runs in the page's isolated world, not this
// module's.
//
// Replaces just the text the user selected (`originalText`) with `newText`,
// leaving the rest of the field or document untouched. Returns 'replaced'
// when it edited an editable field, or 'copied' when there was nothing
// editable to write into and the text only went to the clipboard.
export type ReplaceOutcome = 'replaced' | 'copied'

export function replaceSelectionText(newText: string, originalText: string): ReplaceOutcome {
  const original = originalText.trim()
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
  const active = document.activeElement as HTMLElement | null

  const copyOnly = (): ReplaceOutcome => {
    navigator.clipboard.writeText(newText).catch(() => undefined)
    return 'copied'
  }

  // Types the text in through the editing pipeline, so the field's undo
  // history and the page's own input handlers behave as if the user typed it.
  const insert = (): boolean => {
    try {
      return document.execCommand('insertText', false, newText)
    } catch {
      return false
    }
  }

  const isField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
    !!el &&
    (el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' &&
        ['text', 'search', 'email', 'url', 'tel'].includes((el as HTMLInputElement).type)))

  if (isField(active)) {
    const value = active.value
    let from = active.selectionStart ?? 0
    let to = active.selectionEnd ?? 0

    // Prefer the live selection; if it moved, find the original text in the field.
    if (value.slice(from, to).trim() !== original) {
      const index = original ? value.indexOf(original) : -1
      if (index === -1) return copyOnly()
      from = index
      to = index + original.length
    }
    while (from < to && /\s/.test(value[from])) from++
    while (to > from && /\s/.test(value[to - 1])) to--

    active.focus()
    active.setSelectionRange(from, to)
    if (insert()) return 'replaced'

    // Fallback: write through the element's own value setter. Frameworks such
    // as React track the value on the element instance and ignore assignments
    // made through `el.value = …`, so a plain assignment silently reverts.
    const proto = active.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setValue = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (!setValue) return copyOnly()
    setValue.call(active, value.slice(0, from) + newText + value.slice(to))
    active.setSelectionRange(from + newText.length, from + newText.length)
    active.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: newText }),
    )
    return 'replaced'
  }

  if (active && active.isContentEditable) {
    const selection = window.getSelection()
    const stillSelected =
      !!selection && selection.rangeCount > 0 && squash(selection.toString()) === squash(original)

    if (!stillSelected) {
      // The selection was lost (e.g. focus moved to the side panel) — look for the text again.
      const walker = document.createTreeWalker(active, NodeFilter.SHOW_TEXT)
      let found: Range | null = null
      for (let node = walker.nextNode(); node && !found; node = walker.nextNode()) {
        const index = original ? (node as Text).data.indexOf(original) : -1
        if (index !== -1) {
          found = document.createRange()
          found.setStart(node, index)
          found.setEnd(node, index + original.length)
        }
      }
      if (!found || !selection) return copyOnly()
      selection.removeAllRanges()
      selection.addRange(found)
    }

    active.focus()
    if (insert()) return 'replaced'

    const range = selection?.getRangeAt(0)
    if (!range) return copyOnly()
    range.deleteContents()
    range.insertNode(document.createTextNode(newText))
    active.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: newText }))
    return 'replaced'
  }

  return copyOnly()
}
