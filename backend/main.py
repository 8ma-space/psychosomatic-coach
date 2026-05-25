import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import session, rag
from services.rag_service import rag_service

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize RAG in the background so startup isn't blocked by model download
    asyncio.create_task(rag_service.initialize())
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


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "rag_initialized": rag_service.initialized,
        "knowledge_chunks": rag_service.get_document_count(),
    }
