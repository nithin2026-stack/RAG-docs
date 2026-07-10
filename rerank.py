from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def rerank(question, candidates, top_k=3):
    pairs = [(question, c["text"]) for c in candidates]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(candidates, scores), key=lambda x: -x[1])
    return [c for c, score in ranked[:top_k]]

if __name__ == "__main__":
    from hybrid_search import hybrid_search
    question = "What does Depends do?"
    candidates = hybrid_search(question)
    top = rerank(question, candidates)
    for r in top:
        print(f"[{r['source']}] {r['text'][:150]}...")