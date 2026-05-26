"""
D-ID Streaming API proxy — keeps the API key server-side.

Flow:
  1. POST   /streams           → create D-ID streaming session, returns SDP offer + ICE servers
  2. POST   /streams/{id}/sdp  → forward browser's SDP answer
  3. POST   /streams/{id}/ice  → forward each ICE candidate as it's gathered
  4. POST   /streams/{id}/talk → send text; D-ID animates Fiona with ElevenLabs voice
  5. DELETE /streams/{id}      → close the session
"""

import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

DID_API_KEY = os.getenv("DID_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "ROMJ9yK1NAMuu1ggrjDW")

# Fiona – nature presenter
FIONA_THUMBNAIL = (
    "https://clips-presenters.d-id.com/v2/fiona_pink_shirt_nature"
    "/YbSy_eGr0t/YK3poyBbmx/thumbnail.png"
)

DID_BASE = "https://api.d-id.com"


def _did_headers() -> dict:
    return {
        "Authorization": f"Basic {DID_API_KEY}",
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# 1. Create stream
# ---------------------------------------------------------------------------

@router.post("/streams")
async def create_stream():
    """Open a new D-ID streaming session for Fiona and return the WebRTC offer."""
    if not DID_API_KEY:
        raise HTTPException(status_code=503, detail="Avatar not configured (missing DID_API_KEY)")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{DID_BASE}/talks/streams",
            headers=_did_headers(),
            json={"source_url": FIONA_THUMBNAIL},
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"D-ID create error: {resp.text[:400]}")

    return resp.json()


# ---------------------------------------------------------------------------
# 2. SDP answer
# ---------------------------------------------------------------------------

class SDPRequest(BaseModel):
    stream_id: str
    session_id: str
    answer: dict  # { type: "answer", sdp: "..." }


@router.post("/streams/{stream_id}/sdp")
async def send_sdp(stream_id: str, req: SDPRequest):
    """Forward the browser's SDP answer back to D-ID."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{DID_BASE}/talks/streams/{stream_id}/sdp",
            headers=_did_headers(),
            json={"answer": req.answer, "session_id": req.session_id},
        )

    if not resp.is_success:
        raise HTTPException(status_code=502, detail=f"D-ID SDP error: {resp.text[:400]}")

    return resp.json() if resp.content else {"ok": True}


# ---------------------------------------------------------------------------
# 3. ICE candidates
# ---------------------------------------------------------------------------

class ICERequest(BaseModel):
    stream_id: str
    session_id: str
    candidate: str
    sdpMid: str
    sdpMLineIndex: int


@router.post("/streams/{stream_id}/ice")
async def send_ice(stream_id: str, req: ICERequest):
    """Forward a gathered ICE candidate to D-ID."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{DID_BASE}/talks/streams/{stream_id}/ice",
            headers=_did_headers(),
            json={
                "candidate": req.candidate,
                "sdpMid": req.sdpMid,
                "sdpMLineIndex": req.sdpMLineIndex,
                "session_id": req.session_id,
            },
        )

    if not resp.is_success:
        raise HTTPException(status_code=502, detail=f"D-ID ICE error: {resp.text[:400]}")

    return {"ok": True}


# ---------------------------------------------------------------------------
# 4. Animate (talk)
# ---------------------------------------------------------------------------

class TalkRequest(BaseModel):
    stream_id: str
    session_id: str
    text: str


@router.post("/streams/{stream_id}/talk")
async def send_talk(stream_id: str, req: TalkRequest):
    """Send AI coach text to D-ID; Fiona speaks it via ElevenLabs voice."""
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured (missing ELEVENLABS_API_KEY)")

    text = req.text.strip()
    # Keep latency reasonable — D-ID has its own limits too
    if len(text) > 1500:
        text = text[:1500] + "…"

    payload = {
        "script": {
            "type": "text",
            "input": text,
            "provider": {
                "type": "elevenlabs",
                "voice_id": ELEVENLABS_VOICE_ID,
                "api_key": ELEVENLABS_API_KEY,
            },
        },
        "config": {"fluent": True, "pad_audio": 0.0},
        "session_id": req.session_id,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{DID_BASE}/talks/streams/{stream_id}",
            headers=_did_headers(),
            json=payload,
        )

    if not resp.is_success:
        raise HTTPException(status_code=502, detail=f"D-ID talk error: {resp.text[:400]}")

    return resp.json()


# ---------------------------------------------------------------------------
# 5. Close stream
# ---------------------------------------------------------------------------

class DeleteRequest(BaseModel):
    session_id: str


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: str, req: DeleteRequest):
    """Gracefully close the D-ID streaming session."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.delete(
            f"{DID_BASE}/talks/streams/{stream_id}",
            headers=_did_headers(),
            json={"session_id": req.session_id},
        )
    return {"ok": True}
