'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createWebSocket, createSession, endSession } from '@/lib/api';
import type { ChatMessage, ConsentRecord, PacingAction, WSMessage } from '@/lib/types';

let msgCounter = 0;
const nextId = () => `msg_${++msgCounter}_${Date.now()}`;

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pacingAction, setPacingAction] = useState<PacingAction>('continue');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const handleWSMessage = useCallback((event: MessageEvent) => {
    const data: WSMessage = JSON.parse(event.data as string);

    if (data.type === 'stream_start') {
      const id = nextId();
      streamingIdRef.current = id;
      setIsStreaming(true);
      if (data.pacing_action) setPacingAction(data.pacing_action);
      setMessages(prev => [
        ...prev,
        { id, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true, pacing_action: data.pacing_action },
      ]);
    } else if (data.type === 'stream_chunk' && streamingIdRef.current) {
      const chunk = data.content ?? '';
      setMessages(prev =>
        prev.map(m =>
          m.id === streamingIdRef.current ? { ...m, content: m.content + chunk } : m
        )
      );
    } else if (data.type === 'stream_end') {
      // Capture ID into a local const BEFORE nulling the ref — the functional
      // updater passed to setMessages runs after the event handler returns, so
      // reading streamingIdRef.current inside the updater would see null.
      const endId = streamingIdRef.current;
      streamingIdRef.current = null;
      if (endId) {
        setMessages(prev =>
          prev.map(m => (m.id === endId ? { ...m, isStreaming: false } : m))
        );
      }
      setIsStreaming(false);
      setPacingAction('continue');
    } else if (data.type === 'pacing_update' && data.action) {
      setPacingAction(data.action);
    } else if (data.type === 'error') {
      setError(data.message ?? 'An error occurred');
    }
  }, []);

  const startSession = useCallback(
    async (consent: ConsentRecord) => {
      setError(null);
      try {
        const session = await createSession(consent);
        setSessionId(session.session_id);

        if (session.opening_message) {
          setMessages([
            {
              id: nextId(),
              role: 'assistant',
              content: session.opening_message,
              timestamp: new Date(),
            },
          ]);
        }

        const ws = createWebSocket(session.session_id);
        wsRef.current = ws;
        ws.onopen = () => setIsConnected(true);
        ws.onclose = () => setIsConnected(false);
        ws.onerror = () => setError('Connection error. Please refresh.');
        ws.onmessage = handleWSMessage;

        return session.session_id;
      } catch (err) {
        setError('Failed to start session. Is the backend running?');
        throw err;
      }
    },
    [handleWSMessage]
  );

  const sendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (isStreaming || !content.trim()) return;

      setMessages(prev => [
        ...prev,
        { id: nextId(), role: 'user', content, timestamp: new Date() },
      ]);

      wsRef.current.send(JSON.stringify({ type: 'message', content }));
    },
    [isStreaming]
  );

  const sendVisionSignals = useCallback((signals: object) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'vision_signals', signals }));
  }, []);

  const finishSession = useCallback(async () => {
    wsRef.current?.close();
    wsRef.current = null;
    if (sessionId) await endSession(sessionId);
    setSessionId(null);
    setIsConnected(false);
    setMessages([]);
  }, [sessionId]);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  return {
    sessionId,
    messages,
    isConnected,
    isStreaming,
    pacingAction,
    error,
    startSession,
    sendMessage,
    sendVisionSignals,
    finishSession,
  };
}
