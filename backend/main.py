import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import session, rag, tts, avatar
from services.rag_service import rag_service

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # RAG initializes lazily on first use — don't load model at startup
    yield


app = FastAPI(
    title="Psychosomatic Coaching Platform",
    description="AI-powered psychosomatic coaching — safety-first, consent-driven",
    version="1.0.0",
    lifespan=lifespan,
)

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(rag.router, prefix="/api/rag", tags=["knowledge"])
app.include_router(tts.router, prefix="/api/tts", tags=["tts"])
app.include_router(avatar.router, prefix="/api/avatar", tags=["avatar"])


@app.get("/health")
async def health_check():
    chunks = rag_service.get_document_count()
    return {
        "status": "healthy",
        "rag_initialized": rag_service.initialized,
        "knowledge_chunks": chunks,
        # Reminder visible in Railway logs if the volume loses data
        "knowledge_status": "loaded" if chunks > 0 else "empty — re-ingest PDFs via POST /api/rag/ingest",
    }
