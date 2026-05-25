import type { ConsentRecord } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';

export async function createSession(consent: ConsentRecord) {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json() as Promise<{ session_id: string; opening_message: string; phase: string }>;
}

export async function endSession(sessionId: string) {
  await fetch(`${API_BASE}/api/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});
}

export function createWebSocket(sessionId: string): WebSocket {
  return new WebSocket(`${WS_BASE}/api/sessions/ws/${sessionId}`);
}

export async function sendVisionSignals(sessionId: string, signals: object) {
  await fetch(`${API_BASE}/api/sessions/${sessionId}/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, signals }),
  }).catch(() => {});
}

export async function uploadPDF(file: File): Promise<{ chunks_indexed: number; total_chunks: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/rag/ingest`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Failed to upload PDF');
  return res.json();
}

export async function getRagStatus(): Promise<{ initialized: boolean; document_chunks: number }> {
  const res = await fetch(`${API_BASE}/api/rag/status`);
  if (!res.ok) return { initialized: false, document_chunks: 0 };
  return res.json();
}
