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

export interface UsageInfo {
  used: number
  limit: number
}

export interface ImproveResponse {
  requestId: string
  style: string
  outputText: string
  // Absent when the request went straight to Groq with the user's own key —
  // the shared free allowance only applies to backend-routed requests.
  usage?: UsageInfo
}

export interface ImproveErrorResponse {
  error: string
  code?: string
  usage?: UsageInfo
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
