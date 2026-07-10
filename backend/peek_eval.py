import json

with open("eval_results.json", encoding="utf-8") as f:
    data = json.load(f)

targets = ["How do you send data in a request body?", "How do you define a query parameter in FastAPI?"]

for r in data["details"]:
    if r["question"] in targets:
        print(f"\nQ: {r['question']}")
        print(f"Faithfulness: {r['faithfulness']} | Relevancy: {r['relevancy']}")
        print(f"Answer: {r['answer']}")