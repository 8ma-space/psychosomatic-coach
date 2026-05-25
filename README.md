# Psychosomatic Coaching Platform

AI-powered psychosomatic coaching — consent-driven, safety-first, adaptive.

## Architecture

```
frontend/   Next.js 14 + TypeScript + Tailwind
            MediaPipe Tasks Vision (browser-side, no video leaves device)
            Web Speech API (voice input + TTS)
            WebSocket → backend

backend/    FastAPI + Python
            Claude claude-sonnet-4-6 (streaming responses)
            ChromaDB + sentence-transformers (RAG from Serbian PDFs)
            Decision engine (conservative pacing logic)
            In-memory session store (swap to Postgres for production)
```

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

### 3. Load knowledge base (Serbian PDFs)

Upload your PDF documents via the API:

```bash
curl -X POST http://localhost:8000/api/rag/ingest \
  -F "file=@your-document.pdf"
```

Or use the health endpoint to check status:
```
GET http://localhost:8000/health
GET http://localhost:8000/api/rag/status
```

You can ingest multiple PDFs — they are chunked with overlap and stored in ChromaDB.
The multilingual embedding model (`paraphrase-multilingual-MiniLM-L12-v2`) handles Serbian text
and cross-lingual retrieval with English queries.

## Features

### Session flow
1. **Consent wizard** — camera, audio, and storage consents, each separately
2. **Coaching session** — streamed AI responses via WebSocket
3. **Safety panel** — always-visible controls: end session, grounding, status

### Vision (optional, consent-based)
- Runs entirely in the browser (MediaPipe Tasks Vision)
- Face landmark blendshapes → tension / expression signals
- Pose landmarks → shoulder movement for breathing estimation, posture
- Only derived numbers (0–1 floats) are sent to the backend
- No raw video ever leaves the device

### Adaptive pacing — Decision Engine
The backend evaluates a 5-signal rolling average every time vision data arrives:

| Condition | Action |
|-----------|--------|
| Tension ≥ 0.65 or breathing_change ≥ 0.55 | `pause` |
| Very low engagement + elevated tension | `grounding` |
| Exercise in progress + warning signals | `ask_permission` |
| Moderate tension or breathing change | `slow_down` |
| Low engagement | `slow_down` |
| Normal | `continue` |

The pacing action is injected into Claude's context as `[PACING: <action>]` so it can adapt naturally.

### RAG pipeline
- Upload any number of Serbian (or other language) PDFs
- Text is chunked at ~800 words with 150-word overlap
- Embeddings: `paraphrase-multilingual-MiniLM-L12-v2` (handles cross-lingual retrieval)
- Top-2 retrieved passages are appended to the user message with translation instructions
- Claude translates and applies the methodology in English

## Safety design

- User can stop at any moment — no explanation needed
- Camera can be toggled off mid-session
- Decision engine is conservative: uncertainty → slow down
- Coach system prompt enforces consent-first communication style
- No diagnosis claims, no treatment promises
- Crisis escalation to professional support is baked into the system prompt

## Environment variables

### Backend `.env`
```
ANTHROPIC_API_KEY=sk-ant-...
CORS_ORIGINS=http://localhost:3000
DATA_DIR=./data
CHROMA_PERSIST_DIR=./data/chroma
```

### Frontend `.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Production notes

- Replace in-memory `SessionStore` with a database (SQLite or Postgres via SQLAlchemy)
- Add JWT authentication for session ownership
- Rate-limit the `/api/sessions` POST endpoint
- Set `Cross-Origin-Embedder-Policy` headers — already configured in `next.config.mjs`
- Run ChromaDB as a standalone service for persistence across restarts
- Consider a proper TTS API (ElevenLabs, OpenAI TTS) for higher-quality voice responses
