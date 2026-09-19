export type WriterRole = 'general' | 'gp' | 'analyst'

export const ROLE_OPTIONS: ReadonlyArray<{ id: WriterRole; label: string; hint: string }> = [
  { id: 'general', label: 'General', hint: 'Everyday writing' },
  { id: 'gp', label: 'General Partner', hint: 'Founder emails, passes, LP updates' },
  { id: 'analyst', label: 'Analyst', hint: 'IC memos, diligence questions, action items' },
]

// The styles shown up front for each role; everything else sits under "More".
export const PRIMARY_STYLE_IDS: Record<WriterRole, readonly string[]> = {
  general: ['improve', 'formal', 'professional', 'casual', 'friendly', 'concise'],
  gp: ['improve', 'exec-summary', 'founder-email', 'pass-note', 'lp-update', 'concise'],
  analyst: ['improve', 'ic-memo', 'dd-questions', 'action-items', 'exec-summary', 'concise'],
}

export function isWriterRole(value: unknown): value is WriterRole {
  return value === 'general' || value === 'gp' || value === 'analyst'
}
