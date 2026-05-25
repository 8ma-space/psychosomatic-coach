import os
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from services.rag_service import rag_service

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
UPLOAD_DIR = DATA_DIR / "uploads"

router = APIRouter()


@router.post("/ingest")
async def ingest_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = UPLOAD_DIR / file.filename

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        chunk_count = await rag_service.ingest_pdf(str(file_path), file.filename)
        return {
            "status": "success",
            "file": file.filename,
            "chunks_indexed": chunk_count,
            "total_chunks": rag_service.get_document_count(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@router.get("/status")
async def get_rag_status():
    return {
        "initialized": rag_service.initialized,
        "document_chunks": rag_service.get_document_count(),
    }
