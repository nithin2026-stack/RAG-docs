import json
import chromadb
from sentence_transformers import SentenceTransformer

with open("chunks.json", encoding="utf-8") as f:
    chunks = json.load(f)

embedder = SentenceTransformer("all-MiniLM-L6-v2")

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection("fastapi_docs")

texts = [c["text"] for c in chunks]
ids = [c["id"] for c in chunks]
metadatas = [{"source": c["source"]} for c in chunks]

embeddings = embedder.encode(texts).tolist()

collection.add(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)

print(f"Stored {len(chunks)} chunks in ChromaDB")