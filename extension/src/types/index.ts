export interface StyleOption {
  id: string
  label: string
  description: string
}

export interface ImproveRequest {
  text: string
  style: string
  language?: string
  customInstruction?: string
}

export interface ImproveResponse {
  requestId: string
  style: string
  outputText: string
}

export interface ImproveErrorResponse {
  error: string
}

export interface SelectionMessage {
  type: 'OPEN_SIDE_PANEL_WITH_SELECTION'
  text: string
  // Open the panel even when Quick Mode is on (used to send the user to the
  // Groq-key setup after a Quick Mode request hit the free limit).
  forcePanel?: boolean
}

export interface QuickImproveDoneMessage {
  type: 'QUICK_IMPROVE_DONE'
  ok: boolean
  reason?: 'limit' | 'key' | 'error'
}

export interface QuickModeSettings {
  enabled: boolean
  styleId: string
}
