import os
import asyncio
from pathlib import Path
from typing import List, Optional

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
CHROMA_DIR = Path(os.getenv("CHROMA_PERSIST_DIR", "./data/chroma"))


class RAGService:
    def __init__(self):
        self.client = None
        self.collection = None
        self.embedder = None
        self.initialized = False

    async def initialize(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        await asyncio.get_event_loop().run_in_executor(None, self._sync_initialize)
        if self.embedder is not None:
            self.initialized = True
            print("[RAG] Service initialized.")
        else:
            print("[RAG] Skipped — dependencies not available.")

    def _sync_initialize(self):
        try:
            import chromadb
            from chromadb.config import Settings
            from sentence_transformers import SentenceTransformer
        except ImportError:
            print("[RAG] chromadb/sentence-transformers not installed — RAG disabled.")
            return

        self.client = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=Settings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name="psychosomatic_knowledge",
            metadata={"description": "Psychosomatic coaching methodology"},
        )
        # Multilingual model handles Serbian source documents + English queries
        self.embedder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

    async def ingest_pdf(self, file_path: str, source_name: str) -> int:
        if not self.initialized:
            await self.initialize()
        chunks = await asyncio.get_event_loop().run_in_executor(
            None, self._extract_pdf_chunks, file_path, source_name
        )
        if not chunks:
            return 0
        await asyncio.get_event_loop().run_in_executor(None, self._index_chunks, chunks)
        return len(chunks)

    def _extract_pdf_chunks(self, file_path: str, source_name: str) -> List[dict]:
        import pypdf

        chunks = []
        reader = pypdf.PdfReader(file_path)

        full_text = ""
        for page_num, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            full_text += f"\n[Page {page_num + 1}]\n{text}"

        chunk_size = 800
        overlap = 150
        words = full_text.split()

        for i in range(0, len(words), chunk_size - overlap):
            chunk_words = words[i : i + chunk_size]
            if len(chunk_words) < 50:
                continue
            chunks.append({
                "text": " ".join(chunk_words),
                "source": source_name,
                "chunk_index": len(chunks),
            })

        return chunks

    def _index_chunks(self, chunks: List[dict]):
        if not self.collection or not self.embedder:
            raise RuntimeError("RAG service not initialized")

        texts = [c["text"] for c in chunks]
        embeddings = self.embedder.encode(texts, show_progress_bar=False).tolist()
        ids = [f"{c['source']}_chunk_{c['chunk_index']}" for c in chunks]
        metadatas = [{"source": c["source"], "chunk_index": c["chunk_index"]} for c in chunks]

        self.collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )

    async def retrieve(self, query: str, n_results: int = 3) -> List[str]:
        if not self.initialized:
            return []  # No documents loaded yet — skip RAG silently

        count = self.collection.count()
        if count == 0:
            return []

        return await asyncio.get_event_loop().run_in_executor(
            None, lambda: self._sync_retrieve(query, min(n_results, count))
        )

    def _sync_retrieve(self, query: str, n_results: int) -> List[str]:
        query_embedding = self.embedder.encode([query], show_progress_bar=False).tolist()[0]
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
        )
        return [doc for doc in (results.get("documents") or [[]])[0] if doc]

    def get_document_count(self) -> int:
        if not self.collection:
            return 0
        return self.collection.count()


rag_service = RAGService()
