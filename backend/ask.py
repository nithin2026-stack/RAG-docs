import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
client_groq = Groq(api_key=os.getenv("GROQ_API_KEY"))


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