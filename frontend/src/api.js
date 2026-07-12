const API_BASE = "http://localhost:8000";
const API_KEY = "7f3c124f5a232ce8817d2d4f461231ee071825f4460178222751379652199c2d";

export function uploadFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/upload`);
    xhr.setRequestHeader("X-API-Key", API_KEY);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

export async function deleteDocument(filename) {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`, {
    method: "DELETE",
    headers: { "X-API-Key": API_KEY },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Delete failed");
  }
  return res.json();
}

export async function askQuestionStream(question, filenames, { onSources, onToken, onDone, onError }) {
  let res;
  try {
    res = await fetch(`${API_BASE}/query/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
      body: JSON.stringify({ question, filenames }),
    });
  } catch (err) {
    onError?.("Could not reach the server");
    return;
  }

  if (!res.ok || !res.body) {
    try {
      const err = await res.json();
      onError?.(err.detail || "Query failed");
    } catch {
      onError?.("Query failed");
    }
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop();

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      try {
        const msg = JSON.parse(jsonStr);
        if (msg.type === "sources") onSources?.(msg.sources);
        else if (msg.type === "token") onToken?.(msg.text);
        else if (msg.type === "done") onDone?.();
        else if (msg.type === "error") onError?.(msg.message);
      } catch {
        // ignore malformed lines
      }
    }
  }
}