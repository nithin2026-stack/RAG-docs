import os
import json
import re
import time

def call_groq_with_retry(prompt, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = client_groq.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content
        except Exception as e:
            if "rate_limit" in str(e).lower() and attempt < max_retries - 1:
                wait = 2 ** attempt  # 1s, 2s, 4s
                print(f"Rate limited, waiting {wait}s...")
                time.sleep(wait)
            else:
                raise
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from groq import Groq

from hybrid_search import hybrid_search
from rerank import rerank
from ask import ask_with_enforcement

load_dotenv()
client_groq = Groq(api_key=os.getenv("GROQ_API_KEY"))

def score_faithfulness(answer, context):
    if answer.strip() == "NOT_FOUND":
        return 1.0
    prompt = f"""Judge if the ANSWER is fully supported by the CONTEXT, with no invented facts.
Respond with ONLY a number between 0 and 1 (e.g. 0.9), nothing else.

CONTEXT:
{context}

ANSWER:
{answer}

Score:"""
    content = call_groq_with_retry(prompt)
    match = re.search(r"[\d.]+", content)
    return float(match.group()) if match else 0.0

def score_relevancy(question, answer):
    if answer.strip() == "NOT_FOUND":
        return 1.0
    prompt = f"""Judge if the ANSWER actually addresses the QUESTION asked.
Respond with ONLY a number between 0 and 1 (e.g. 0.9), nothing else.

QUESTION: {question}
ANSWER: {answer}

Score:"""
    content = call_groq_with_retry(prompt)
    match = re.search(r"[\d.]+", content)
    return float(match.group()) if match else 0.0

def process_one(item):
    question = item["question"]
    contexts = hybrid_search(question)
    top_contexts = rerank(question, contexts)
    answer = ask_with_enforcement(question, top_contexts)
    context_text = "\n\n".join(c["text"] for c in top_contexts)

    faith = score_faithfulness(answer, context_text)
    rel = score_relevancy(question, answer)

    print(f"[{faith:.2f} / {rel:.2f}] {question[:50]}...")
    return {"question": question, "answer": answer, "faithfulness": faith, "relevancy": rel}

with open("golden_dataset.json", encoding="utf-8") as f:
    golden = json.load(f)

results = []
with ThreadPoolExecutor(max_workers=2) as executor:
    futures = [executor.submit(process_one, item) for item in golden]
    for future in as_completed(futures):
        results.append(future.result())

avg_faith = sum(r["faithfulness"] for r in results) / len(results)
avg_rel = sum(r["relevancy"] for r in results) / len(results)

print(f"\nAverage faithfulness: {avg_faith:.2f}")
print(f"Average relevancy: {avg_rel:.2f}")

with open("eval_results.json", "w", encoding="utf-8") as f:
    json.dump({"faithfulness": avg_faith, "relevancy": avg_rel, "details": results}, f, indent=2)

print("Saved eval_results.json")