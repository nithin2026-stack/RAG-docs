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
        start += chunk_size - overlap  # overlap in action
    return chunks

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