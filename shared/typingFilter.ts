// Shared by the extension and the backend tests — keep this file dependency-free.
//
// The privacy gate for "learn from what I type". Everything here is pure: it
// decides whether a field, a host or a piece of text may be remembered, and
// nothing else. When in doubt it rejects — a missed sample costs nothing, a
// captured secret costs everything.

export interface TypingFieldInfo {
  tagName: string
  // The element's `type` for <input>; ignored for everything else.
  inputType?: string
  autocomplete?: string
  name?: string
  id?: string
  ariaLabel?: string
  placeholder?: string
  isContentEditable: boolean
}

// Text boxes only: <textarea>, <input type=text> and contenteditable. Search
// boxes are deliberately out — a query is not a message.
const ALLOWED_INPUT_TYPES = new Set(['', 'text'])

// autocomplete tokens that mean "credentials, payment or personal details".
const BLOCKED_AUTOCOMPLETE =
  /^(cc-.+|one-time-code|new-password|current-password|username|email|tel(-.+)?|name|given-name|additional-name|family-name|honorific-.+|street-address|address-line\d|postal-code|bday(-.+)?|transaction-.+|webauthn)$/

// Matched against name / id / aria-label / placeholder after camelCase and
// punctuation are turned into spaces ("otpCode" -> "otp code").
const SENSITIVE_LOOSE =
  /password|passcode|passwd|passphrase|secret|token|api ?key|routing|account ?n(um|o)|social ?security|security ?code|credit ?card|card ?n(um|o)|one ?time/
const SENSITIVE_WORD = /\b(pass|pwd|otp|pin|cvv|cvv2|cvc|ccv|ssn|iban|card|aadhaar|aadhar|passport)\b/
const SEARCH_WORD = /\b(search|query|filter)\b/

function normaliseAttr(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function attrIsSensitive(value: string | undefined): boolean {
  if (!value) return false
  const n = normaliseAttr(value)
  if (!n) return false
  return SENSITIVE_LOOSE.test(n) || SENSITIVE_WORD.test(n) || SEARCH_WORD.test(n)
}

export function shouldCaptureField(info: TypingFieldInfo): boolean {
  const tag = (info.tagName ?? '').toLowerCase()

  if (tag === 'textarea') {
    // fine
  } else if (tag === 'input') {
    const type = (info.inputType ?? 'text').toLowerCase().trim()
    if (!ALLOWED_INPUT_TYPES.has(type)) return false
  } else if (!info.isContentEditable) {
    return false
  }

  if (info.autocomplete) {
    for (const token of info.autocomplete.toLowerCase().split(/\s+/)) {
      if (token && BLOCKED_AUTOCOMPLETE.test(token)) return false
    }
  }

  return !(
    attrIsSensitive(info.name) ||
    attrIsSensitive(info.id) ||
    attrIsSensitive(info.ariaLabel) ||
    attrIsSensitive(info.placeholder)
  )
}

// ---------------------------------------------------------------------------
// Hosts

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  // banking / finance / payments / crypto
  /bank|paypal|stripe|venmo|revolut|monzo|coinbase|binance|kraken|razorpay|paytm|phonepe|zerodha|robinhood|fidelity|schwab|vanguard/,
  /(^|\.)wise\.com$/,
  /(^|[.-])chase([.-]|$)/,
  /wellsfargo|hdfc|icici|axisbank|kotak|onlinesbi/,
  /(^|[.-])sbi(\.|$)/,
  // health / medical
  /health|medical|patient|hospital|clinic|pharma|mychart/,
  // government / tax
  /\.gov(\.|$)|^gov\./,
  /irs\.gov|incometax/,
  /(^|[.-])(tax|taxes|turbotax)([.-]|$)/,
  // password managers
  /1password|lastpass|bitwarden|dashlane|keepass|nordpass/,
]

// A sign-in / identity page when any label before the registrable one is one
// of these (login.example.com, accounts.google.com, id.me).
const AUTH_LABELS = new Set(['login', 'signin', 'sign-in', 'auth', 'sso', 'id', 'accounts', 'account', 'oauth'])

function normaliseHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '')
}

export function isBlockedHost(hostname: string, userDisabled: string[] = []): boolean {
  const host = normaliseHost(hostname ?? '')
  if (!host) return true // nothing to attribute the text to — don't learn

  for (const entry of userDisabled) {
    const d = normaliseHost(String(entry ?? ''))
    if (d && (host === d || host.endsWith(`.${d}`))) return true
  }

  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(host))) return true

  const labels = host.split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    if (AUTH_LABELS.has(labels[i])) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Text

export const MIN_SAMPLE_CHARS = 4
export const MAX_SAMPLE_CHARS = 240

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/
const URL_RE = /(?:https?:\/\/|www\.)\S+/gi
const URL_WITH_QUERY_RE = /(?:https?:\/\/|www\.)\S*[?#@]\S*/i
const BARE_DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|in|co|dev|app|ai|me|ly|gg|xyz|info|edu|gov|uk)(\/\S*)?$/i
// >= 9 digits with at most two separator chars between them (phone, card, ID).
const DIGIT_RUN_RE = /\p{Nd}(?:[\s\-.()+/]{0,2}\p{Nd}){8,}/u
const SECRET_WORD_RE =
  /\b(password|passcode|passwd|pwd|otp|cvv|cvc|api[\s_-]?key|secret key|private key|ssn|social security)\b|BEGIN [A-Z ]*PRIVATE KEY/i
const CODE_CHARS_RE = /[{};=<>]/g
const CODE_START_RE =
  /^(import\s+[\w{*]|export\s+(default|const|function|class)\b|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|function\s*\w*\s*\(|def\s+\w+\s*\(|class\s+\w+\s*[:{(]|return\s+[\w(["']+.*;|#include|<\?php|<\/?[a-zA-Z][\w-]*[\s>/]|SELECT\s.+\sFROM\s|(git|npm|yarn|pnpm|sudo|curl|pip|docker)\s+[\w-]+|\$\s|\/\/|\/\*|#!)/
const CODE_SHAPE_RE = /```|=>|===|!==|&&|\|\||::|<\/\w+>|\(\)|\w\.\w+\(.*\)/
const TOKEN_RUN_RE = /[A-Za-z0-9_\-+/=]{20,}/g

function isSecretToken(tok: string): boolean {
  if (tok.length < 20) return false
  // "heyyyyyyyyyyyyyyyyyyyy" — stretched words have very few distinct letters.
  if (new Set(tok.toLowerCase()).size <= 6) return false
  if (/^eyJ/.test(tok)) return true // JWT
  if (/\d/.test(tok)) return true
  if (/[A-Z]/.test(tok.slice(1)) && /[a-z]/.test(tok)) return true
  if (tok.length >= 32 && !/^[a-z]+([-_][a-z]+)+$/.test(tok)) return true
  return false
}

export function cleanTypedText(raw: string): string | null {
  if (typeof raw !== 'string') return null

  const text = raw
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' ')
    .trim()

  const length = Array.from(text).length
  if (length < MIN_SAMPLE_CHARS || length > MAX_SAMPLE_CHARS) return null

  if (EMAIL_RE.test(text)) return null
  if (SECRET_WORD_RE.test(text)) return null
  if (DIGIT_RUN_RE.test(text)) return null

  // Mostly non-letters (numbers, punctuation, symbols). Emoji count as part of
  // the voice, so they are not held against the text.
  const nonSpace = Array.from(text.replace(/\s/g, ''))
  const letters = nonSpace.filter((c) => /\p{L}/u.test(c)).length
  const pictographs = nonSpace.filter((c) => /\p{Extended_Pictographic}/u.test(c)).length
  if (letters < 2 || (letters + pictographs) / nonSpace.length < 0.6) return null

  // URL-only / domain-only, or URLs carrying query strings / fragments / creds.
  if (URL_WITH_QUERY_RE.test(text)) return null
  if (BARE_DOMAIN_RE.test(text)) return null
  const withoutUrls = text.replace(URL_RE, ' ')
  if (withoutUrls !== text) {
    const remaining = (withoutUrls.match(/\p{L}/gu) ?? []).length
    if (remaining < 4) return null
  }

  // Code. "<3" hearts are ordinary texting, not markup.
  const codeChars = (text.replace(/<3/g, '').match(CODE_CHARS_RE) ?? []).length
  if (codeChars >= 3) return null
  if (CODE_START_RE.test(text) || CODE_SHAPE_RE.test(text)) return null

  // Secrets / tokens / keys.
  for (const run of text.match(TOKEN_RUN_RE) ?? []) {
    if (isSecretToken(run)) return null
  }

  return text
}
