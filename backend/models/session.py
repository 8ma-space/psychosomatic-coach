from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class SessionPhase(str, Enum):
    ARRIVING = "arriving"
    CONSENT = "consent"
    GROUNDING = "grounding"
    EXPLORATION = "exploration"
    INTEGRATION = "integration"
    CLOSING = "closing"
    PAUSED = "paused"
    ENDED = "ended"


class PacingAction(str, Enum):
    CONTINUE = "continue"
    SLOW_DOWN = "slow_down"
    PAUSE = "pause"
    ASK_PERMISSION = "ask_permission"
    GROUNDING = "grounding"


class ConsentRecord(BaseModel):
    camera_consent: bool = False
    audio_consent: bool = False
    data_storage_consent: bool = False
    coaching_consent: bool = True
    consented_at: datetime = Field(default_factory=datetime.utcnow)


class VisionSignals(BaseModel):
    breathing_change: float = Field(default=0.0, ge=0.0, le=1.0)
    tension_level: float = Field(default=0.0, ge=0.0, le=1.0)
    engagement: float = Field(default=1.0, ge=0.0, le=1.0)
    expression_change: float = Field(default=0.0, ge=0.0, le=1.0)
    posture_change: float = Field(default=0.0, ge=0.0, le=1.0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    pacing_action: Optional[PacingAction] = None


class SessionCreate(BaseModel):
    consent: ConsentRecord


class SessionState(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    phase: SessionPhase = SessionPhase.ARRIVING
    consent: ConsentRecord
    messages: List[ChatMessage] = []
    vision_history: List[VisionSignals] = []
    last_pacing_action: PacingAction = PacingAction.CONTINUE
    exercise_in_progress: bool = False
    pause_count: int = 0

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class MessageRequest(BaseModel):
    content: str
    session_id: str


class VisionUpdate(BaseModel):
    session_id: str
    signals: VisionSignals
