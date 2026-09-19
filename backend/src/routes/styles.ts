import { Hono } from 'hono'

export const STYLES = [
  { id: 'improve', label: 'Improve', description: 'General grammar, clarity and readability' },
  { id: 'formal', label: 'Formal', description: 'Formal and respectful communication' },
  { id: 'professional', label: 'Professional', description: 'Workplace/business communication' },
  { id: 'casual', label: 'Casual', description: 'Natural conversational language' },
  { id: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { id: 'concise', label: 'Concise', description: 'Shorter while preserving meaning' },
  { id: 'clear-simple', label: 'Clear & Simple', description: 'Easier to understand' },
  { id: 'grammar-fix', label: 'Grammar Fix', description: 'Grammar, spelling and punctuation' },
  { id: 'custom', label: 'Custom', description: 'User-defined instructions' },
] as const

export type StyleId = (typeof STYLES)[number]['id']

export const stylesRoute = new Hono()

stylesRoute.get('/', (c) => {
  return c.json({ styles: STYLES })
})
