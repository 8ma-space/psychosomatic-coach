'use client';

/**
 * useAvatar — manages a D-ID Streaming (WebRTC) session for the Fiona avatar.
 *
 * Flow:
 *  connect()   → calls backend /api/avatar/streams → gets SDP offer + ICE servers
 *              → creates RTCPeerConnection, answers, exchanges ICE, waits for 'connected'
 *  speak(text) → calls backend /api/avatar/streams/{id}/talk
 *              → Fiona's video animates with ElevenLabs voice
 *              → data channel 'stream/done' fires to signal end of speech
 *  disconnect() → closes RTCPeerConnection + tells backend to clean up D-ID session
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const AVATAR_API = `${API_URL}/api/avatar`;

interface UseAvatarOptions {
  onSpeakingChange?: (speaking: boolean) => void;
}

export function useAvatar({ onSpeakingChange }: UseAvatarOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // useRef<T>(null) with T not including null → RefObject<T> (React 18 overload)
  const videoRef = useRef<HTMLVideoElement>(null);

  // Text queued before WebRTC is ready — flushed once connected
  const pendingTalkRef = useRef<string | null>(null);

  // Keep callback stable across renders
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  useEffect(() => { onSpeakingChangeRef.current = onSpeakingChange; }, [onSpeakingChange]);

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  const _setSpeaking = useCallback((val: boolean) => {
    setIsSpeaking(val);
    onSpeakingChangeRef.current?.(val);
  }, []);

  /** Actually POST to the talk endpoint — assumes stream is connected. */
  const _doTalk = useCallback(async (text: string) => {
    if (!streamIdRef.current || !sessionIdRef.current) return;
    _setSpeaking(true);
    try {
      const resp = await fetch(`${AVATAR_API}/streams/${streamIdRef.current}/talk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream_id: streamIdRef.current,
          session_id: sessionIdRef.current,
          text,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.status.toString());
        console.error('[useAvatar] talk error:', errText);
        _setSpeaking(false);
      }
      // isSpeaking flips back via data-channel 'stream/done' — see ondatachannel below.
      // Safety net: if D-ID never fires done (rare), we clear after 30 s.
      setTimeout(() => _setSpeaking(false), 30_000);
    } catch (err) {
      console.error('[useAvatar] talk fetch failed:', err);
      _setSpeaking(false);
    }
  }, [_setSpeaking]);

  // -------------------------------------------------------------------------
  // disconnect
  // -------------------------------------------------------------------------

  const disconnect = useCallback(async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    const sid = streamIdRef.current;
    const sesId = sessionIdRef.current;
    streamIdRef.current = null;
    sessionIdRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
    _setSpeaking(false);

    if (sid && sesId) {
      fetch(`${AVATAR_API}/streams/${sid}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sesId }),
      }).catch(() => { /* best-effort */ });
    }
  }, [_setSpeaking]);

  // -------------------------------------------------------------------------
  // connect
  // -------------------------------------------------------------------------

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);
    setAvatarError(null);

    try {
      // ── 1. Create D-ID stream, get SDP offer ───────────────────────────────
      const createResp = await fetch(`${AVATAR_API}/streams`, { method: 'POST' });
      if (!createResp.ok) {
        const txt = await createResp.text().catch(() => createResp.status.toString());
        throw new Error(`Create stream failed (${createResp.status}): ${txt}`);
      }
      const streamData = await createResp.json();
      const { id: streamId, session_id: sessionId, offer, ice_servers } = streamData;

      streamIdRef.current = streamId;
      sessionIdRef.current = sessionId;

      // ── 2. Create RTCPeerConnection ────────────────────────────────────────
      const pc = new RTCPeerConnection({ iceServers: ice_servers ?? [] });
      pcRef.current = pc;

      // Attach incoming video/audio tracks to the <video> element
      const mediaStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach(track => mediaStream.addTrack(track));
        if (videoRef.current && videoRef.current.srcObject !== mediaStream) {
          videoRef.current.srcObject = mediaStream;
        }
      };

      // D-ID sends status messages via a data channel
      pc.ondatachannel = (event) => {
        event.channel.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string);
            // stream/done = Fiona finished the current utterance
            if (msg.type === 'stream/done' || msg.type === 'stream/idle') {
              _setSpeaking(false);
            }
          } catch { /* ignore non-JSON */ }
        };
      };

      // Send ICE candidates to D-ID as they're gathered
      pc.onicecandidate = async (event) => {
        if (!event.candidate) return; // gathering complete
        const { candidate, sdpMid, sdpMLineIndex } = event.candidate;
        if (!candidate || !streamIdRef.current || !sessionIdRef.current) return;
        try {
          await fetch(`${AVATAR_API}/streams/${streamIdRef.current}/ice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stream_id: streamIdRef.current,
              session_id: sessionIdRef.current,
              candidate,
              sdpMid: sdpMid ?? '0',
              sdpMLineIndex: sdpMLineIndex ?? 0,
            }),
          });
        } catch { /* non-fatal */ }
      };

      // Watch connection lifecycle
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          setIsConnected(true);
          setIsConnecting(false);
          // Flush any talk that was queued while we were connecting
          const pending = pendingTalkRef.current;
          if (pending) {
            pendingTalkRef.current = null;
            setTimeout(() => _doTalk(pending), 600);
          }
        } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          setIsConnected(false);
          setIsConnecting(false);
        }
      };

      // ── 3. Set remote SDP offer, create answer ─────────────────────────────
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // ── 4. Send our SDP answer to D-ID ─────────────────────────────────────
      const sdpResp = await fetch(`${AVATAR_API}/streams/${streamId}/sdp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream_id: streamId,
          session_id: sessionId,
          answer: { type: answer.type, sdp: answer.sdp },
        }),
      });
      if (!sdpResp.ok) {
        throw new Error(`SDP exchange failed: ${sdpResp.status}`);
      }

      // RTCPeerConnection will now negotiate; onconnectionstatechange fires 'connected'

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Avatar connection failed';
      console.error('[useAvatar] connect error:', msg);
      setAvatarError(msg);
      setIsConnecting(false);
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      streamIdRef.current = null;
      sessionIdRef.current = null;
    }
  }, [isConnecting, isConnected, _doTalk, _setSpeaking]);

  // -------------------------------------------------------------------------
  // Public: speak — auto-connects if needed, queues if still connecting
  // -------------------------------------------------------------------------

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (!isConnected) {
      pendingTalkRef.current = text;
      if (!isConnecting) connect();
      return;
    }
    await _doTalk(text);
  }, [isConnected, isConnecting, connect, _doTalk]);

  const stopSpeaking = useCallback(() => {
    // We can't interrupt D-ID mid-utterance via the SDK, but we signal locally
    _setSpeaking(false);
  }, [_setSpeaking]);

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (pcRef.current) pcRef.current.close();
      const sid = streamIdRef.current;
      const sesId = sessionIdRef.current;
      if (sid && sesId) {
        fetch(`${AVATAR_API}/streams/${sid}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sesId }),
        }).catch(() => {});
      }
    };
  }, []);

  return {
    videoRef,
    isConnected,
    isConnecting,
    isSpeaking,
    avatarError,
    connect,
    disconnect,
    speak,
    stopSpeaking,
  };
}
