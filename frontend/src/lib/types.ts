export type SessionPhase =
  | 'arriving'
  | 'consent'
  | 'grounding'
  | 'exploration'
  | 'integration'
  | 'closing'
  | 'paused'
  | 'ended';

export type PacingAction =
  | 'continue'
  | 'slow_down'
  | 'pause'
  | 'ask_permission'
  | 'grounding';

export interface ConsentRecord {
  camera_consent: boolean;
  audio_consent: boolean;
  data_storage_consent: boolean;
  coaching_consent: boolean;
}

export interface VisionSignals {
  breathing_change: number;
  tension_level: number;
  engagement: number;
  expression_change: number;
  posture_change: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  pacing_action?: PacingAction;
  isStreaming?: boolean;
}

export interface Session {
  session_id: string;
  phase: SessionPhase;
  consent: ConsentRecord;
  opening_message?: string;
}

export type WSMessageType =
  | 'stream_start'
  | 'stream_chunk'
  | 'stream_end'
  | 'pacing_update'
  | 'error'
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  content?: string;
  pacing_action?: PacingAction;
  action?: PacingAction;
  reason?: string;
  message?: string;
}
