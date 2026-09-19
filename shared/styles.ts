// Shared by the backend and the extension — keep this file dependency-free.
export const STYLES = [
  { id: 'improve', label: 'Improve', description: 'General grammar, clarity and readability', group: 'tone' },
  { id: 'formal', label: 'Formal', description: 'Formal and respectful communication', group: 'tone' },
  { id: 'professional', label: 'Professional', description: 'Workplace/business communication', group: 'tone' },
  { id: 'casual', label: 'Casual', description: 'Natural conversational language', group: 'tone' },
  { id: 'friendly', label: 'Friendly', description: 'Warm and approachable', group: 'tone' },
  { id: 'concise', label: 'Concise', description: 'Shorter while preserving meaning', group: 'tone' },
  { id: 'clear-simple', label: 'Clear & Simple', description: 'Easier to understand', group: 'tone' },
  { id: 'grammar-fix', label: 'Grammar Fix', description: 'Grammar, spelling and punctuation', group: 'tone' },
  { id: 'custom', label: 'Custom', description: 'User-defined instructions', group: 'tone' },
  // Investor / analyst work. Appended after the original nine so existing ids keep their order.
  { id: 'exec-summary', label: 'Exec summary', description: 'Lead with the conclusion, keep the key numbers', group: 'business' },
  { id: 'founder-email', label: 'Founder email', description: 'Direct, respectful email to a founder', group: 'business' },
  { id: 'pass-note', label: 'Kind pass', description: 'Decline an opportunity clearly and respectfully', group: 'business' },
  { id: 'ic-memo', label: 'IC memo', description: 'Neutral, evidence-based investment-committee voice', group: 'business' },
  { id: 'dd-questions', label: 'DD questions', description: 'Turn notes into sharp diligence questions', group: 'business' },
  { id: 'action-items', label: 'Action items', description: 'Owner, action, timing', group: 'business' },
  { id: 'lp-update', label: 'LP update', description: 'Measured, factual update for limited partners', group: 'business' },
] as const

export type StyleId = (typeof STYLES)[number]['id']
