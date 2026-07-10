import requests
from bs4 import BeautifulSoup
import os

os.makedirs("docs", exist_ok=True)

urls = {
    "tutorial-first-steps": "https://fastapi.tiangolo.com/tutorial/first-steps/",
    "path-params": "https://fastapi.tiangolo.com/tutorial/path-params/",
    "query-params": "https://fastapi.tiangolo.com/tutorial/query-params/",
    "request-body": "https://fastapi.tiangolo.com/tutorial/body/",
    "dependencies": "https://fastapi.tiangolo.com/tutorial/dependencies/",
}

for name, url in urls.items():
    resp = requests.get(url)
    soup = BeautifulSoup(resp.text, "html.parser")
    article = soup.find("article")
    text = article.get_text(separator="\n")
    with open(f"docs/{name}.txt", "w", encoding="utf-8") as f:
        f.write(text)
    print(f"Saved {name}")