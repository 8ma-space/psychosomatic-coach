from pydantic import BaseModel, Field
from typing import Optional


class FacialAnalysis(BaseModel):
    brow_tension: float = Field(default=0.0, ge=0.0, le=1.0)
    jaw_tension: float = Field(default=0.0, ge=0.0, le=1.0)
    eye_openness: float = Field(default=0.5, ge=0.0, le=1.0)
    expression_valence: float = Field(default=0.0, ge=-1.0, le=1.0)


class PostureAnalysis(BaseModel):
    shoulder_elevation: float = Field(default=0.0, ge=0.0, le=1.0)
    head_forward: float = Field(default=0.0, ge=0.0, le=1.0)
    body_lean: float = Field(default=0.0, ge=-1.0, le=1.0)


class BreathingAnalysis(BaseModel):
    estimated_rate: Optional[float] = None
    regularity: float = Field(default=1.0, ge=0.0, le=1.0)
    depth_estimate: float = Field(default=0.5, ge=0.0, le=1.0)
    change_from_baseline: float = Field(default=0.0, ge=0.0, le=1.0)


class VisionAnalysisResult(BaseModel):
    facial: Optional[FacialAnalysis] = None
    posture: Optional[PostureAnalysis] = None
    breathing: Optional[BreathingAnalysis] = None
    overall_tension: float = Field(default=0.0, ge=0.0, le=1.0)
    engagement_level: float = Field(default=1.0, ge=0.0, le=1.0)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
