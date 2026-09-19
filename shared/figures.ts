// Shared by the backend and the extension — keep this file dependency-free.
//
// Finds the numeric figures in a piece of text (amounts, percentages, plain
// numbers) so a rewrite can be checked for silently changed numbers.

// An optional currency marker, a number (digits, commas, optional decimals),
// and an optional unit. The unit must not run into a following letter, so the
// "m" in "5 months" and the "l" in "5 large" are not read as million / lakh.
const FIGURE =
  /(?:[₹$€£]|rs\.?|inr|usd|eur|gbp)?\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|crores?|cr|lakhs?|lacs?|mn|bn|[lkmbx])(?![a-z]))?/gi

const CURRENCY: Record<string, string> = { rs: '₹', 'rs.': '₹', inr: '₹', usd: '$', eur: '€', gbp: '£' }
const UNIT: Record<string, string> = {
  crore: 'cr',
  crores: 'cr',
  lakh: 'l',
  lakhs: 'l',
  lac: 'l',
  lacs: 'l',
  mn: 'm',
  bn: 'b',
}

export interface Figure {
  // Canonical form used for comparison, e.g. "₹5cr" or "12.5%".
  key: string
  // The text as the author wrote it, for showing back to the user.
  display: string
}

export interface FigureComparison {
  // In the rewrite but not the original (or appearing more often).
  added: string[]
  // In the original but not the rewrite (or appearing more often).
  missing: string[]
  // How many figures the original contains.
  total: number
}

function normalise(raw: string): string {
  const m = /^([₹$€£]|rs\.?|inr|usd|eur|gbp)?\s?(\d[\d,]*(?:\.\d+)?)\s?(.*)$/i.exec(raw.trim())
  if (!m) return raw.toLowerCase()
  const [, currency = '', number, unit = ''] = m
  const symbol = CURRENCY[currency.toLowerCase()] ?? currency
  // Grouping is presentation ("5,00,000" == "500,000"), and so are trailing zeros ("5.0" == "5").
  const value = number.replace(/,/g, '')
  const canonical = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value
  const u = unit.toLowerCase()
  return `${symbol}${canonical}${UNIT[u] ?? u}`
}

export function extractFigures(text: string): Figure[] {
  // Numbered-list markers ("1.", "2)") are structure, not figures.
  const cleaned = text.replace(/^\s*\d{1,2}[.)]\s+/gm, '')
  return [...cleaned.matchAll(FIGURE)].map((m) => ({ key: normalise(m[0]), display: m[0].trim() }))
}

function count(figures: Figure[]): Map<string, { n: number; display: string }> {
  const counts = new Map<string, { n: number; display: string }>()
  for (const f of figures) {
    const entry = counts.get(f.key)
    if (entry) entry.n += 1
    else counts.set(f.key, { n: 1, display: f.display })
  }
  return counts
}

function surplus(a: Map<string, { n: number; display: string }>, b: Map<string, { n: number; display: string }>) {
  const out: string[] = []
  for (const [key, { n, display }] of a) {
    if (n > (b.get(key)?.n ?? 0)) out.push(display)
  }
  return out
}

export function compareFigures(original: string, rewritten: string): FigureComparison {
  const before = extractFigures(original)
  const after = extractFigures(rewritten)
  const beforeCounts = count(before)
  const afterCounts = count(after)
  return {
    added: surplus(afterCounts, beforeCounts),
    missing: surplus(beforeCounts, afterCounts),
    total: before.length,
  }
}
