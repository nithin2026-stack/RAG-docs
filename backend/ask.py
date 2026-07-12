import yaml
import os
from dotenv import load_dotenv
import chromadb
from sentence_transformers import SentenceTransformer
from groq import Groq


def load_prompt(version="v2"):
    with open("prompts.yaml", encoding="utf-8") as f:
        prompts = yaml.safe_load(f)
    return prompts[version]["template"]


load_dotenv()
client_groq = Groq(api_key=os.getenv("GROQ_API_KEY"))

embedder = SentenceTransformer("all-MiniLM-L6-v2")
client_db = chromadb.PersistentClient(path="./chroma_db")
collection = client_db.get_collection("fastapi_docs")


def ask(question, top_k=3):
    q_embedding = embedder.encode([question]).tolist()
    results = collection.query(query_embeddings=q_embedding, n_results=top_k)

    contexts = results["documents"][0]
    sources = results["metadatas"][0]

    context_block = "\n\n".join(
        f"[Source: {s['source']}]\n{c}"
        for c, s in zip(contexts, sources)
    )

    prompt = f"""Answer the question using ONLY the context below.
Cite the source file name for your answer.
If the answer is not in the context, say "I don't know based on the provided docs."

Context:
{context_block}

Question: {question}

Answer:"""

    response = client_groq.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}]
    )

    print(response.choices[0].message.content)


def ask_with_enforcement(question, contexts):
    context_block = "\n\n".join(
        f"[{c['source']}]\n{c['text']}" for c in contexts
    )

    prompt = f"""You must answer ONLY using the context below.
Rules:
- If the context does not clearly contain the answer, respond EXACTLY: "NOT_FOUND"
- Otherwise, answer in 2-3 sentences and end with (Source: filename)
- Answer in the same language the question was asked in

Context:
{context_block}

Question: {question}
Answer:"""

    response = client_groq.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}]
    )

    return response.choices[0].message.content


def ask_stream(question, contexts):
    context_block = "\n\n".join(
        f"[{c['source']}]\n{c['text']}" for c in contexts
    )

    prompt = f"""You must answer ONLY using the context below.
Rules:
- If the context does not clearly contain the answer, respond EXACTLY: "NOT_FOUND"
- Otherwise, answer in 2-3 sentences and end with (Source: filename)
- Answer in the same language the question was asked in

Context:
{context_block}

Question: {question}
Answer:"""

    stream = client_groq.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


if __name__ == "__main__":
    from hybrid_search import hybrid_search
    from rerank import rerank

    question = "How do I deploy FastAPI to Kubernetes?"

    # Hybrid retrieval
    candidates = hybrid_search(question)

    # Rerank retrieved documents
    top_contexts = rerank(question, candidates)

    # Stream the response
    for chunk in ask_stream(question, top_contexts):
        print(chunk, end="", flush=True)

    print()