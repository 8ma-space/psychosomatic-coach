from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from models.session import (
    SessionCreate,
    SessionState,
    VisionUpdate,
    ChatMessage,
    PacingAction,
)
from services.session_store import session_store
from services.coach import coach_service
from services.decision_engine import decision_engine

router = APIRouter()


@router.post("", response_model=dict)
async def create_session(body: SessionCreate):
    session = SessionState(consent=body.consent)
    session_store.create(session)

    opening = await coach_service.get_opening_message(session)
    session_store.add_message(session.session_id, ChatMessage(role="assistant", content=opening))

    return {
        "session_id": session.session_id,
        "opening_message": opening,
        "phase": session.phase,
    }


@router.get("/{session_id}")
async def get_session(session_id: str):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/vision")
async def update_vision(session_id: str, body: VisionUpdate):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session_store.add_vision_signal(session_id, body.signals)
    action, reason = decision_engine.evaluate(session, body.signals)
    session_store.update_pacing(session_id, action)
    return {"pacing_action": action, "reason": reason}


@router.delete("/{session_id}")
async def end_session(session_id: str):
    if not session_store.get(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    session_store.delete(session_id)
    return {"status": "ended"}


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()

    session = session_store.get(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "message":
                await _handle_message(websocket, session_id, data.get("content", ""))
            elif msg_type == "vision_signals":
                await _handle_vision(websocket, session_id, data.get("signals", {}))
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


async def _handle_message(websocket: WebSocket, session_id: str, content: str):
    session = session_store.get(session_id)
    if not session or not content.strip():
        return

    session_store.add_message(session_id, ChatMessage(role="user", content=content))

    pacing_action = session.last_pacing_action

    await websocket.send_json({
        "type": "stream_start",
        "pacing_action": pacing_action.value,
    })

    full_response = ""
    async for chunk in coach_service.get_response_stream(session, content, pacing_action):
        full_response += chunk
        await websocket.send_json({"type": "stream_chunk", "content": chunk})

    session_store.add_message(
        session_id,
        ChatMessage(role="assistant", content=full_response, pacing_action=pacing_action),
    )

    await websocket.send_json({
        "type": "stream_end",
        "pacing_action": pacing_action.value,
    })

    # Reset pacing after responding so next message starts fresh
    session_store.update_pacing(session_id, PacingAction.CONTINUE)


async def _handle_vision(websocket: WebSocket, session_id: str, signals_data: dict):
    session = session_store.get(session_id)
    if not session:
        return

    from models.session import VisionSignals
    try:
        signals = VisionSignals(**signals_data)
    except Exception:
        return

    session_store.add_vision_signal(session_id, signals)
    action, reason = decision_engine.evaluate(session, signals)
    session_store.update_pacing(session_id, action)

    if action != PacingAction.CONTINUE:
        await websocket.send_json({
            "type": "pacing_update",
            "action": action.value,
            "reason": reason,
        })
