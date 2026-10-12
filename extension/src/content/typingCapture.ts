import { cleanTypedText, isBlockedHost, shouldCaptureField } from '../../../shared/typingFilter.js'
import { addTypedSample, getLearningSettings } from '../services/typingStore'

// Opt-in "learn from what I type" capture. Observes FINISHED messages only —
// an Enter-to-send, or a field losing focus after being edited — never
// keystrokes, and hands the filtered text to the on-device store. Nothing here
// logs, uploads, or reads a field while learning is off.

const SETTINGS_KEY = 'learningSettings'
// After Enter, the page gets this long to clear the field before we decide the
// keypress was a send (rather than a newline inside a longer message).
const SEND_CONFIRM_MS = 150
// A blurred field is only recorded after this quiet period; refocusing it
// (the user is still composing) cancels the pending sample.
const BLUR_COMMIT_MS = 1500
// Longest field we are willing to read at all — messages, not documents.
const MAX_READ_CHARS = 1000
// Single-line <input> blurs are overwhelmingly form fields (name, city…), not
// messages, so they are recorded on Enter-to-send only.
const CAPTURE_INPUT_ON_BLUR = false

interface CachedSettings {
  enabled: boolean
  disabledHosts: string[]
}

let started = false
let settings: CachedSettings = { enabled: false, disabledHosts: [] }

// Fields edited since they were last recorded. Set from `input` events, which
// only mark the field — the value is never read there.
const dirty = new WeakSet<Element>()
const lastRecorded = new WeakMap<Element, string>()
const pendingBlur = new Map<Element, { text: string; timer: ReturnType<typeof setTimeout> }>()

function normaliseSettings(value: unknown): CachedSettings {
  const v = (value ?? {}) as { enabled?: unknown; disabledHosts?: unknown }
  return {
    enabled: v.enabled === true,
    disabledHosts: Array.isArray(v.disabledHosts) ? v.disabledHosts.filter((h): h is string => typeof h === 'string') : [],
  }
}

// Cheap enough to run on every candidate event; the host check depends on the
// user-disabled list, which can change while the page is open.
function learningActive(): boolean {
  if (!settings.enabled) return false
  return !isBlockedHost(location.hostname, settings.disabledHosts)
}

function pageHasPasswordField(): boolean {
  try {
    return document.querySelector('input[type="password"]') !== null
  } catch {
    return false
  }
}

// keydown/focusout targets can be a child of the real editing surface.
function resolveField(target: EventTarget | undefined | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  let el: HTMLElement = target
  if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT' && el.isContentEditable) {
    while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement
  }
  return el
}

function isEligibleField(el: HTMLElement): boolean {
  const isInput = el instanceof HTMLInputElement
  const isTextarea = el instanceof HTMLTextAreaElement
  if ((isInput || isTextarea) && (el.disabled || el.readOnly)) return false

  const attr = (name: string) => el.getAttribute(name) ?? undefined
  const ok = shouldCaptureField({
    tagName: el.tagName,
    inputType: isInput ? el.type : undefined,
    autocomplete: attr('autocomplete'),
    name: attr('name'),
    id: el.id || undefined,
    ariaLabel: attr('aria-label'),
    placeholder: attr('placeholder') ?? attr('aria-placeholder') ?? attr('data-placeholder'),
    isContentEditable: el.isContentEditable,
  })
  if (!ok) return false

  // A form that also holds a password box is a login / sign-up form.
  const form = el.closest('form')
  if (form && form.querySelector('input[type="password"]')) return false
  return !pageHasPasswordField()
}

// Raw text of the field, or null when it is too large to be a message.
function readField(el: HTMLElement): string | null {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value.length > MAX_READ_CHARS ? null : el.value
  }
  const content = el.textContent ?? ''
  if (content.length > MAX_READ_CHARS) return null
  return el.innerText ?? content
}

// Read + filter in one go so the raw text is not kept around any longer than
// this call.
function snapshot(el: HTMLElement): string | null {
  if (!learningActive() || !isEligibleField(el)) return null
  const raw = readField(el)
  if (raw === null) return null
  return cleanTypedText(raw)
}

function commit(el: Element, text: string) {
  if (lastRecorded.get(el) === text) return
  if (!learningActive()) return // toggled off or host disabled since the snapshot
  lastRecorded.set(el, text)
  dirty.delete(el)
  try {
    addTypedSample(text, location.hostname).catch(() => {})
  } catch {
    // Extension context invalidated (extension reloaded) — nothing to do.
  }
}

function cancelPendingBlur(el: Element) {
  const pending = pendingBlur.get(el)
  if (pending) {
    clearTimeout(pending.timer)
    pendingBlur.delete(el)
  }
}

function flushPendingBlurs() {
  for (const [el, pending] of pendingBlur) {
    clearTimeout(pending.timer)
    commit(el, pending.text)
  }
  pendingBlur.clear()
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
  if (e.isComposing || e.repeat) return
  if (!learningActive()) return

  const field = resolveField(e.composedPath()[0])
  if (!field) return

  // Synchronous, capture phase: before the page's own handler clears the field.
  const text = snapshot(field)
  if (text === null) return

  // Enter is a send only if the field then empties (or the page removes it).
  // Otherwise it was a newline in a longer message and the blur path records
  // the finished text instead of every intermediate paragraph.
  setTimeout(() => {
    if (!field.isConnected) return commit(field, text)
    const after = readField(field)
    if (after === null) return
    if (after.trim().length === 0 || after.trim().length < text.length / 2) {
      cancelPendingBlur(field)
      commit(field, text)
    }
  }, SEND_CONFIRM_MS)
}

function onInput(e: Event) {
  if (!settings.enabled) return
  const target = e.composedPath()[0]
  if (target instanceof Element) {
    const field = resolveField(target)
    if (field) dirty.add(field)
  }
}

function onFocusIn(e: FocusEvent) {
  const field = resolveField(e.composedPath()[0])
  if (field) cancelPendingBlur(field) // still composing
}

function onFocusOut(e: FocusEvent) {
  if (!learningActive()) return
  const field = resolveField(e.composedPath()[0])
  if (!field || !dirty.has(field)) return
  if (field instanceof HTMLInputElement && !CAPTURE_INPUT_ON_BLUR) {
    dirty.delete(field)
    return
  }

  const text = snapshot(field)
  dirty.delete(field)
  if (text === null) return

  cancelPendingBlur(field)
  const timer = setTimeout(() => {
    pendingBlur.delete(field)
    commit(field, text)
  }, BLUR_COMMIT_MS)
  pendingBlur.set(field, { text, timer })
}

function insideIncognito(): boolean {
  try {
    return chrome.extension?.inIncognitoContext === true
  } catch {
    return false
  }
}

export function startTypingCapture(): void {
  if (started) return
  started = true

  if (window.top !== window) return
  if (insideIncognito()) return
  if (!/^https?:$/.test(location.protocol)) return

  // Cache settings; the store writes them to chrome.storage.local under
  // `learningSettings`, so a toggle in the UI reaches open tabs immediately.
  try {
    getLearningSettings()
      .then((s) => {
        settings = normaliseSettings(s)
      })
      .catch(() => {})
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !(SETTINGS_KEY in changes)) return
      settings = normaliseSettings(changes[SETTINGS_KEY].newValue)
      if (!settings.enabled) {
        // Learning just went off: drop anything still waiting to be recorded.
        for (const pending of pendingBlur.values()) clearTimeout(pending.timer)
        pendingBlur.clear()
      }
    })
  } catch {
    return
  }

  // Capture phase so pages that stop propagation can't hide the event.
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('input', onInput, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', onFocusOut, true)
  window.addEventListener('pagehide', flushPendingBlurs)
}
