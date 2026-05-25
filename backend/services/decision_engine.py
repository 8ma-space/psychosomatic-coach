from typing import Tuple, Optional
from models.session import VisionSignals, PacingAction, SessionState


class DecisionEngine:
    """
    Conservative adaptive pacing engine.
    Bias: when uncertain, slow down rather than push forward.
    """

    TENSION_WARNING = 0.45
    TENSION_CRITICAL = 0.65
    BREATHING_WARNING = 0.35
    BREATHING_CRITICAL = 0.55
    ENGAGEMENT_LOW = 0.35
    ENGAGEMENT_VERY_LOW = 0.20

    def evaluate(
        self,
        session: SessionState,
        latest_signals: Optional[VisionSignals] = None,
    ) -> Tuple[PacingAction, str]:
        if not session.consent.camera_consent or latest_signals is None:
            return self._text_only_evaluation(session)

        recent = list(session.vision_history[-5:])
        if latest_signals:
            recent.append(latest_signals)

        if not recent:
            return PacingAction.CONTINUE, "no_signals"

        avg_tension = sum(s.tension_level for s in recent) / len(recent)
        avg_breathing = sum(s.breathing_change for s in recent) / len(recent)
        avg_engagement = sum(s.engagement for s in recent) / len(recent)
        avg_expression = sum(s.expression_change for s in recent) / len(recent)

        if avg_tension >= self.TENSION_CRITICAL or avg_breathing >= self.BREATHING_CRITICAL:
            return PacingAction.PAUSE, "high_activation_detected"

        if avg_engagement <= self.ENGAGEMENT_VERY_LOW and avg_tension >= self.TENSION_WARNING:
            return PacingAction.GROUNDING, "low_engagement_with_tension"

        if session.exercise_in_progress and (
            avg_tension >= self.TENSION_WARNING or avg_breathing >= self.BREATHING_WARNING
        ):
            return PacingAction.ASK_PERMISSION, "elevated_signals_during_exercise"

        if avg_tension >= self.TENSION_WARNING or avg_breathing >= self.BREATHING_WARNING:
            return PacingAction.SLOW_DOWN, "moderate_activation_detected"

        if avg_engagement <= self.ENGAGEMENT_LOW:
            return PacingAction.SLOW_DOWN, "low_engagement"

        if avg_expression >= 0.6 and session.exercise_in_progress:
            return PacingAction.ASK_PERMISSION, "active_processing_detected"

        return PacingAction.CONTINUE, "signals_within_range"

    def _text_only_evaluation(self, session: SessionState) -> Tuple[PacingAction, str]:
        recent_user_msgs = [
            m.content.lower()
            for m in session.messages[-4:]
            if m.role == "user"
        ]

        stop_words = {"stop", "enough", "pause", "break", "rest", "no", "wait", "overwhelm", "too much"}
        slow_words = {"slow", "dizzy", "tired", "heavy", "hard", "difficult", "scared", "anxious"}

        for msg in recent_user_msgs:
            if any(word in msg for word in stop_words):
                return PacingAction.PAUSE, "user_stop_signal"

        for msg in recent_user_msgs:
            if any(word in msg for word in slow_words):
                return PacingAction.SLOW_DOWN, "user_difficulty_signal"

        return PacingAction.CONTINUE, "conversation_normal"

    def get_pacing_note(self, action: PacingAction) -> Optional[str]:
        notes = {
            PacingAction.PAUSE: "I'm sensing this might be a good moment to pause.",
            PacingAction.GROUNDING: "Before we continue, let's take a moment to ground.",
            PacingAction.ASK_PERMISSION: "I want to check in with you before we go further.",
        }
        return notes.get(action)


decision_engine = DecisionEngine()
