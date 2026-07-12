import os
import json

def chunk_text(text, chunk_size=600, overlap=100):
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks

def chunk_all_docs():
    all_chunks = []
    for filename in os.listdir("docs"):
        with open(f"docs/{filename}", encoding="utf-8") as f:
            text = f.read()
        chunks = chunk_text(text)
        for i, c in enumerate(chunks):
            all_chunks.append({"id": f"{filename}-{i}", "source": filename, "text": c})

    with open("chunks.json", "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, indent=2)

    print(f"Created {len(all_chunks)} chunks")
    return len(all_chunks)

def add_document_chunks(filename, text):
    """Chunk a single document and add/replace it in chunks.json"""
    if os.path.exists("chunks.json"):
        with open("chunks.json", encoding="utf-8") as f:
            existing = json.load(f)
    else:
        existing = []

    # Remove any existing chunks from a previous upload of this same filename
    existing = [c for c in existing if c["source"] != filename]

    new_chunks = chunk_text(text)
    for i, c in enumerate(new_chunks):
        existing.append({"id": f"{filename}-{i}", "source": filename, "text": c})

    with open("chunks.json", "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2)

    print(f"Added {len(new_chunks)} chunks from {filename}")
    return len(new_chunks)

if __name__ == "__main__":
    chunk_all_docs()