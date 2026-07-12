import json
from rank_bm25 import BM25Okapi
import chromadb
from sentence_transformers import SentenceTransformer

embedder = SentenceTransformer("all-MiniLM-L6-v2")
client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_collection("fastapi_docs")

chunks = []
bm25 = None

def load_index():
    global chunks, bm25
    with open("chunks.json", encoding="utf-8") as f:
        chunks = json.load(f)
    tokenized = [c["text"].lower().split() for c in chunks]
    bm25 = BM25Okapi(tokenized)

load_index()  # load once at import time

def hybrid_search(question, top_k=5):
    bm25_scores = bm25.get_scores(question.lower().split())
    bm25_top_idx = sorted(range(len(bm25_scores)), key=lambda i: -bm25_scores[i])[:top_k]
    bm25_results = [chunks[i] for i in bm25_top_idx]

    q_embedding = embedder.encode([question]).tolist()
    vec_results = collection.query(query_embeddings=q_embedding, n_results=top_k)
    vec_chunk_ids = vec_results["ids"][0]
    vec_results_full = [c for c in chunks if c["id"] in vec_chunk_ids]

    combined = {c["id"]: c for c in bm25_results + vec_results_full}
    return list(combined.values())

if __name__ == "__main__":
    results = hybrid_search("What does Depends do?")
    for r in results:
        print(f"[{r['source']}] {r['text'][:100]}...")