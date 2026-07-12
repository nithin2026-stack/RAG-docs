import os
from pypdf import PdfReader
from docx import Document

def extract_pdf(filepath):
    reader = PdfReader(filepath)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return text

def extract_docx(filepath):
    doc = Document(filepath)
    return "\n".join(p.text for p in doc.paragraphs)

def extract_txt(filepath):
    with open(filepath, encoding="utf-8") as f:
        return f.read()

def extract_text(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext == ".pdf":
        return extract_pdf(filepath)
    elif ext == ".docx":
        return extract_docx(filepath)
    elif ext in (".txt", ".md"):
        return extract_txt(filepath)
    else:
        raise ValueError(f"Unsupported file type: {ext}")