import json
import chromadb
import hybrid_search  # reuse its already-loaded embedder instead of loading a second copy

def build_vectorstore():
    with open("chunks.json", encoding="utf-8") as f:
        chunks = json.load(f)

    client = chromadb.PersistentClient(path="./chroma_db")
    collection = client.get_or_create_collection("fastapi_docs")

    texts = [c["text"] for c in chunks]
    ids = [c["id"] for c in chunks]
    metadatas = [{"source": c["source"]} for c in chunks]

    embeddings = hybrid_search.embedder.encode(texts).tolist()

    collection.upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)

    print(f"Stored {len(chunks)} chunks in ChromaDB")
    return len(chunks)

if __name__ == "__main__":
    build_vectorstore()