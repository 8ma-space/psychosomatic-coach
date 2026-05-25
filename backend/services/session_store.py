from typing import Optional, Dict, List
from models.session import SessionState, ChatMessage, VisionSignals, PacingAction


class SessionStore:
    def __init__(self):
        self._sessions: Dict[str, SessionState] = {}

    def create(self, session: SessionState) -> SessionState:
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> Optional[SessionState]:
        return self._sessions.get(session_id)

    def update(self, session: SessionState) -> SessionState:
        self._sessions[session.session_id] = session
        return session

    def add_message(self, session_id: str, message: ChatMessage) -> bool:
        session = self.get(session_id)
        if not session:
            return False
        session.messages.append(message)
        return True

    def add_vision_signal(self, session_id: str, signals: VisionSignals) -> bool:
        session = self.get(session_id)
        if not session:
            return False
        session.vision_history.append(signals)
        # Keep rolling window of 60 signals (~1 min at 1/sec)
        if len(session.vision_history) > 60:
            session.vision_history = session.vision_history[-60:]
        return True

    def update_pacing(self, session_id: str, action: PacingAction) -> bool:
        session = self.get(session_id)
        if not session:
            return False
        session.last_pacing_action = action
        return True

    def delete(self, session_id: str) -> bool:
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False

    def list_session_ids(self) -> List[str]:
        return list(self._sessions.keys())


session_store = SessionStore()
