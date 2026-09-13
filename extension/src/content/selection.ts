import type { SelectionMessage } from '../types/index'

let floatingButton: HTMLButtonElement | null = null

function removeFloatingButton() {
  floatingButton?.remove()
  floatingButton = null
}

function showFloatingButton(selectionText: string, rect: DOMRect) {
  removeFloatingButton()

  const button = document.createElement('button')
  button.textContent = '✨ Improve Text'
  button.style.position = 'fixed'
  button.style.top = `${Math.max(rect.top - 36, 4)}px`
  button.style.left = `${rect.left}px`
  button.style.zIndex = '2147483647'
  button.style.padding = '6px 10px'
  button.style.borderRadius = '6px'
  button.style.border = 'none'
  button.style.background = '#4F46E5'
  button.style.color = '#fff'
  button.style.fontSize = '13px'
  button.style.cursor = 'pointer'
  button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'

  button.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const message: SelectionMessage = { type: 'OPEN_SIDE_PANEL_WITH_SELECTION', text: selectionText }
    chrome.runtime.sendMessage(message)
    removeFloatingButton()
  })

  document.body.appendChild(button)
  floatingButton = button
}

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''

  if (!text) {
    removeFloatingButton()
    return
  }

  const range = selection?.getRangeAt(0)
  const rect = range?.getBoundingClientRect()
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    removeFloatingButton()
    return
  }

  showFloatingButton(text, rect)
})

document.addEventListener('mousedown', (e) => {
  if (e.target !== floatingButton) {
    removeFloatingButton()
  }
})
