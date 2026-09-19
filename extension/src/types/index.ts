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
}

export interface QuickImproveDoneMessage {
  type: 'QUICK_IMPROVE_DONE'
  ok: boolean
}

export interface QuickModeSettings {
  enabled: boolean
  styleId: string
}
