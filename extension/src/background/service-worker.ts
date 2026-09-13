import type { SelectionMessage } from '../types/index'

chrome.runtime.onMessage.addListener((message: SelectionMessage, sender) => {
  if (message?.type !== 'OPEN_SIDE_PANEL_WITH_SELECTION') {
    return
  }

  const tabId = sender.tab?.id
  if (tabId === undefined) {
    return
  }

  chrome.storage.session.set({ pendingSelection: message.text }).then(() => {
    chrome.sidePanel.open({ tabId })
  })
})
