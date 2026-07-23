import json
import os
import shutil
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from extract_text import extract_text
from chunk_docs import add_document_chunks
from build_vectorstore import build_vectorstore
import hybrid_search
from rerank import rerank
from ask import ask_with_enforcement, ask_stream

load_dotenv()
API_SECRET_KEY = os.getenv("API_SECRET_KEY")

app = FastAPI()


def verify_key(x_api_key: str = Header(None)):
    if not API_SECRET_KEY:
        return  # no key configured, skip check (dev mode)
    if x_api_key != API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://(localhost:5173|rag-docs.*\.vercel\.app)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    # On a fresh server (like Render's first boot), the vector store is empty.
    # Rebuild it from chunks.json, which IS committed to the repo.
    if hybrid_search.collection.count() == 0 and os.path.exists("chunks.json"):
        build_vectorstore()
        hybrid_search.load_index()

os.makedirs("docs", exist_ok=True)
os.makedirs("uploads", exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


class QueryRequest(BaseModel):
    question: str
    filenames: list[str] | None = None


@app.post("/upload", dependencies=[Depends(verify_key)])
async def upload_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    save_path = os.path.join("uploads", file.filename)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        text = extract_text(save_path)
        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="No extractable text found in file"
            )

        num_chunks = add_document_chunks(file.filename, text)
        build_vectorstore()
        hybrid_search.load_index()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process file: {str(e)}"
        )

    return {
        "filename": file.filename,
        "chunks_added": num_chunks,
        "status": "processed"
    }


@app.post("/query")
async def query(request: QueryRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty"
        )

    try:
        candidates = hybrid_search.hybrid_search(question)
        top_contexts = rerank(question, candidates)
        answer = ask_with_enforcement(question, top_contexts)
        sources = list({c["source"] for c in top_contexts})

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to answer question: {str(e)}"
        )

    return {
        "answer": answer,
        "sources": sources
    }


@app.post("/query/stream", dependencies=[Depends(verify_key)])
async def query_stream(request: QueryRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        if request.filenames is not None and len(request.filenames) == 0:
            # This chat has no documents — don't search anything
            top_contexts = []
        else:
            search_top_k = 15 if request.filenames else 5
            candidates = hybrid_search.hybrid_search(question, top_k=search_top_k)
            if request.filenames:
                candidates = [c for c in candidates if c["source"] in request.filenames]
            top_contexts = rerank(question, candidates) if candidates else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    def event_generator():
        seen = set()
        sources_payload = []
        for c in top_contexts:
            if c["source"] not in seen:
                seen.add(c["source"])
                sources_payload.append({"source": c["source"], "text": c["text"]})
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources_payload})}\n\n"

        try:
            for token in ask_stream(question, top_contexts):
                yield f"data: {json.dumps({'type': 'token', 'text': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.delete("/documents/{filename}", dependencies=[Depends(verify_key)])
async def delete_document(filename: str):
    global chunks_data
    if not os.path.exists("chunks.json"):
        raise HTTPException(status_code=404, detail="No documents found")

    with open("chunks.json", encoding="utf-8") as f:
        existing = json.load(f)

    ids_to_remove = [c["id"] for c in existing if c["source"] == filename]
    if not ids_to_remove:
        raise HTTPException(status_code=404, detail="Document not found")

    remaining = [c for c in existing if c["source"] != filename]
    with open("chunks.json", "w", encoding="utf-8") as f:
        json.dump(remaining, f, indent=2)

    try:
        hybrid_search.collection.delete(ids=ids_to_remove)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove from vector store: {str(e)}")

    hybrid_search.load_index()

    return {"filename": filename, "chunks_removed": len(ids_to_remove), "status": "deleted"}


@app.get("/health")
async def health():
    return {"status": "ok"}