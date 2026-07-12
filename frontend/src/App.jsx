import { useState, useRef, useEffect } from "react";
import { uploadFileWithProgress, askQuestionStream, deleteDocument } from "./api";
import { GoogleLogin, googleLogout } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";

const USER_KEY = "askyourdocs_user";
const THEME_KEY = "askyourdocs_theme";
const AI_NAME = "ANORA";

function keyFor(user, base) {
  const id = user?.email || "guest";
  return `askyourdocs_${base}_${id}`;
}

function loadJSON(key, fallback) {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : fallback;
}

function newConversation() {
  return { id: Date.now().toString(), title: "New chat", messages: [], documents: [] };
}

function migrateConversations(convs) {
  return convs.map((c) => ({ ...c, documents: c.documents || [] }));
}

function FileBadge({ name }) {
  const ext = name.split(".").pop().toUpperCase();
  const colors = { PDF: "#C4453A", DOCX: "#2B579A", TXT: "#5B6472", MD: "#5B6472" };
  return (
    <span
      className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: colors[ext] || "#5B6472", color: "#fff" }}
    >
      {ext}
    </span>
  );
}

function AnoraAvatar({ size = 28 }) {
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: "var(--ink)" }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2 L14.2 9.2 L21.5 11.5 L14.2 13.8 L12 21 L9.8 13.8 L2.5 11.5 L9.8 9.2 Z"
          fill="var(--amber)"
        />
      </svg>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: "var(--slate)", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl p-6 w-full max-w-md mx-4 max-h-[70vh] overflow-y-auto"
        style={{ background: "var(--surface)", color: "var(--ink)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: "var(--slate)" }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => loadJSON(USER_KEY, null));
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [conversations, setConversations] = useState(() => {
    const loaded = migrateConversations(loadJSON(keyFor(loadJSON(USER_KEY, null), "conversations"), []));
    return loaded.length > 0 ? loaded : [newConversation()];
  });
  const [activeId, setActiveId] = useState(() => conversations[0]?.id);
  const [input, setInput] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [processingUpload, setProcessingUpload] = useState(false);
  const [asking, setAsking] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [citation, setCitation] = useState(null);

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const active = conversations.find((c) => c.id === activeId) || conversations[0];
  const activeDocuments = active?.documents || [];
  const uploading = uploadProgress !== null;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!user) return;
    const convs = migrateConversations(loadJSON(keyFor(user, "conversations"), []));
    const finalConvs = convs.length > 0 ? convs : [newConversation()];
    setConversations(finalConvs);
    setActiveId(finalConvs[0].id);
    setInput("");
    setError("");
    setMenuOpen(false);
  }, [user?.email]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(keyFor(user, "conversations"), JSON.stringify(conversations));
  }, [conversations, user?.email]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages, asking]);

  useEffect(() => {
    if (!asking) inputRef.current?.focus();
  }, [asking, activeId]);

  function updateConversation(id, updater) {
    setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }

  function updateActiveMessages(updater) {
    updateConversation(activeId, (c) => {
      const newMessages = updater(c.messages);
      const title =
        c.title === "New chat" && newMessages.length > 0 && newMessages[0].text
          ? newMessages[0].text.slice(0, 40)
          : c.title;
      return { ...c, messages: newMessages, title };
    });
  }

  function handleNewChat() {
    const conv = newConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setInput("");
    setError("");
  }

  function handleClearAllChats() {
    const conv = newConversation();
    setConversations([conv]);
    setActiveId(conv.id);
  }

  function startRename(c) {
    setEditingId(c.id);
    setEditValue(c.title);
  }

  function saveRename() {
    const trimmed = editValue.trim();
    if (trimmed) {
      setConversations((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, title: trimmed } : c))
      );
    }
    setEditingId(null);
  }

  function handleDeleteChat(id) {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const conv = newConversation();
        setActiveId(conv.id);
        return [conv];
      }
      if (id === activeId) setActiveId(remaining[0].id);
      return remaining;
    });
  }

  async function handleFiles(files) {
    setError("");
    for (const file of files) {
      setUploadProgress(0);
      setProcessingUpload(false);
      try {
        const result = await uploadFileWithProgress(file, (pct) => {
          setUploadProgress(pct);
          if (pct >= 100) setProcessingUpload(true);
        });
        updateConversation(activeId, (c) => ({
          ...c,
          documents: [...(c.documents || []), { name: result.filename, chunks: result.chunks_added }],
        }));
      } catch (err) {
        setError(`Could not upload ${file.name}: ${err.message}`);
      } finally {
        setUploadProgress(null);
        setProcessingUpload(false);
      }
    }
  }

  async function removeDocument(name) {
    const prevConversations = conversations;
    updateConversation(activeId, (c) => ({
      ...c,
      documents: (c.documents || []).filter((d) => d.name !== name),
    }));
    try {
      await deleteDocument(name);
    } catch (err) {
      setError(`Could not delete ${name}: ${err.message}`);
      setConversations(prevConversations);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  async function handleAsk() {
    const question = input.trim();
    if (!question || asking) return;

    const filenames = activeDocuments.map((d) => d.name);

    updateActiveMessages((msgs) => [...msgs, { role: "user", text: question }]);
    updateActiveMessages((msgs) => [...msgs, { role: "assistant", text: "", sources: [], streaming: true }]);
    setInput("");
    setAsking(true);
    setError("");

    await askQuestionStream(question, filenames, {
      onSources: (sources) => {
        updateActiveMessages((msgs) => {
          const copy = [...msgs];
          copy[copy.length - 1] = { ...copy[copy.length - 1], sources };
          return copy;
        });
      },
      onToken: (token) => {
        updateActiveMessages((msgs) => {
          const copy = [...msgs];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, text: last.text + token };
          return copy;
        });
      },
      onDone: () => {
        updateActiveMessages((msgs) => {
          const copy = [...msgs];
          copy[copy.length - 1] = { ...copy[copy.length - 1], streaming: false };
          return copy;
        });
        setAsking(false);
      },
      onError: (msg) => {
        setError(msg);
        updateActiveMessages((msgs) => msgs.slice(0, -1));
        setAsking(false);
      },
    });
  }

  function handleSignOut() {
    googleLogout();
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setMenuOpen(false);
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "var(--paper)" }}>
        <div className="text-center max-w-sm px-6">
          <AnoraAvatar size={48} />
          <h1 className="font-display text-3xl font-semibold mt-4 mb-1" style={{ color: "var(--ink)" }}>
            Ask Your Docs
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--slate)" }}>
            Meet {AI_NAME}, your document assistant. Sign in to upload files and start asking questions.
          </p>
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={(cred) => {
                const decoded = jwtDecode(cred.credential);
                const u = { name: decoded.name, picture: decoded.picture, email: decoded.email };
                localStorage.setItem(USER_KEY, JSON.stringify(u));
                setUser(u);
              }}
              onError={() => setError("Google sign-in failed")}
            />
          </div>
          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex" style={{ background: "var(--paper)" }}>
      <aside
        className="w-80 shrink-0 border-r flex flex-col h-full"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="p-6 pb-4">
          <h1 className="font-display text-2xl font-semibold mb-1" style={{ color: "var(--ink)" }}>
            Ask Your Docs
          </h1>
          <p className="text-sm" style={{ color: "var(--slate)" }}>
            Upload a file and ask {AI_NAME} about it.
          </p>
        </div>

        <div
          className="px-6 pb-4"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors"
            style={{
              borderColor: dragOver ? "var(--teal)" : "var(--line)",
              background: dragOver ? "rgba(20,107,107,0.08)" : "transparent",
              opacity: uploading ? 0.85 : 1,
            }}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                {processingUpload ? (
                  <>
                    <div
                      className="w-5 h-5 rounded-full border-2 animate-spin"
                      style={{ borderColor: "var(--line)", borderTopColor: "var(--teal)" }}
                    />
                    <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Processing...</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                      Uploading... {uploadProgress}%
                    </p>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${uploadProgress}%`, background: "var(--teal)" }}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  Click or drop a file here
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
                  Files for this chat only
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => handleFiles(Array.from(e.target.files))}
            />
          </div>
        </div>

        {activeDocuments.length > 0 && (
          <div className="px-6 pb-4 max-h-40 overflow-y-auto">
            <p className="font-mono text-xs uppercase tracking-wide mb-2" style={{ color: "var(--slate)" }}>
              Files in this chat ({activeDocuments.length})
            </p>
            <ul className="space-y-2">
              {activeDocuments.map((doc, i) => (
                <li
                  key={i}
                  className="group flex items-center gap-2 text-sm p-2 rounded border"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                >
                  <FileBadge name={doc.name} />
                  <p className="min-w-0 flex-1 font-medium truncate">{doc.name}</p>
                  <button
                    onClick={() => removeDocument(doc.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none px-1"
                    style={{ color: "var(--slate)" }}
                    title="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="px-6 pt-2 pb-3 border-t" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={handleNewChat}
            className="w-full mt-3 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--teal)" }}
          >
            + New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <p className="font-mono text-xs uppercase tracking-wide mb-2" style={{ color: "var(--slate)" }}>
            Past chats
          </p>
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li
                key={c.id}
                onClick={() => editingId !== c.id && setActiveId(c.id)}
                className="group flex items-center gap-1 text-sm p-2 rounded cursor-pointer"
                style={{
                  background: c.id === activeId ? "rgba(20,107,107,0.12)" : "transparent",
                  color: "var(--ink)",
                }}
              >
                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveRename()}
                    onBlur={saveRename}
                    className="min-w-0 flex-1 text-sm bg-transparent border-b outline-none"
                    style={{ borderColor: "var(--teal)", color: "var(--ink)" }}
                  />
                ) : (
                  <p className="min-w-0 flex-1 truncate">{c.title}</p>
                )}
                {editingId !== c.id && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(c); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none px-1 shrink-0"
                      style={{ color: "var(--slate)" }}
                      title="Rename chat"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteChat(c.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none px-1 shrink-0"
                      style={{ color: "var(--slate)" }}
                      title="Delete chat"
                    >
                      ×
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative border-t p-3 shrink-0" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:opacity-80"
          >
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full shrink-0" />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>{user.name}</p>
              <p className="text-xs truncate" style={{ color: "var(--slate)" }}>{user.email}</p>
            </div>
          </button>
          {menuOpen && (
            <div
              className="absolute left-3 right-3 bottom-16 z-10 rounded-lg border shadow-md py-1"
              style={{ background: "var(--surface)", borderColor: "var(--line)" }}
            >
              <button
                onClick={() => { setShowSettings(true); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:opacity-70"
                style={{ color: "var(--ink)" }}
              >
                Settings
              </button>
              <button
                onClick={() => { setShowAbout(true); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:opacity-70"
                style={{ color: "var(--ink)" }}
              >
                About
              </button>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-3 py-1.5 text-sm hover:opacity-70"
                style={{ color: "var(--ink)" }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full min-w-0">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {(!active || active.messages.length === 0) && (
            <div className="h-full flex items-center justify-center">
              <p className="font-display text-lg text-center" style={{ color: "var(--slate)" }}>
                {activeDocuments.length === 0
                  ? `Hi ${user.name.split(" ")[0]}, upload a file to get started.`
                  : `Hi ${user.name.split(" ")[0]}, what would you like to know?`}
              </p>
            </div>
          )}

          <div className="max-w-2xl mx-auto space-y-5">
            {active?.messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "user" ? (
                  <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full shrink-0" />
                ) : (
                  <AnoraAvatar size={28} />
                )}
                <div className={msg.role === "user" ? "text-right" : ""}>
                  {msg.role === "assistant" && (
                    <p className="font-mono text-xs mb-1" style={{ color: "var(--slate)" }}>
                      {AI_NAME}
                    </p>
                  )}
                  <div
                    className="inline-block text-left rounded-lg px-4 py-3 max-w-lg"
                    style={{
                      background: msg.role === "user" ? "var(--teal)" : "var(--surface)",
                      color: msg.role === "user" ? "#fff" : "var(--ink)",
                      border: msg.role === "assistant" ? "1px solid var(--line)" : "none",
                    }}
                  >
                    {msg.role === "assistant" && msg.streaming && !msg.text ? (
                      <ThinkingDots />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.text}
                        {msg.streaming && <span className="animate-pulse">▋</span>}
                      </p>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {msg.sources.map((src, j) => (
                          <button
                            key={j}
                            onClick={() => setCitation(src)}
                            className="font-mono text-xs px-2 py-0.5 rounded hover:opacity-80 cursor-pointer"
                            style={{ background: "var(--amber)", color: "#1B1F2A" }}
                            title="Click to view passage"
                          >
                            {src.source}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>

        {error && (
          <div className="max-w-2xl mx-auto w-full px-8 shrink-0">
            <p className="text-sm text-red-600 mb-2">{error}</p>
          </div>
        )}

        <div className="border-t p-4 shrink-0" style={{ borderColor: "var(--line)" }}>
          <div className="max-w-2xl mx-auto flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              disabled={asking}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              placeholder={activeDocuments.length === 0 ? "Upload a file first..." : "Type a message..."}
              className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none disabled:opacity-50"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <button
              onClick={handleAsk}
              disabled={asking || !input.trim() || activeDocuments.length === 0}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--teal)" }}
              title={activeDocuments.length === 0 ? "Upload a file to this chat first" : ""}
            >
              Ask
            </button>
          </div>
        </div>
      </main>

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <div className="mb-4">
            <p className="text-xs mb-1" style={{ color: "var(--slate)" }}>Signed in as</p>
            <p className="text-sm">{user.email}</p>
          </div>
          <div className="mb-4">
            <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>Theme</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme("light")}
                className="flex-1 py-2 rounded-lg text-sm border"
                style={{
                  borderColor: "var(--line)",
                  background: theme === "light" ? "var(--teal)" : "transparent",
                  color: theme === "light" ? "#fff" : "var(--ink)",
                }}
              >
                Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className="flex-1 py-2 rounded-lg text-sm border"
                style={{
                  borderColor: "var(--line)",
                  background: theme === "dark" ? "var(--teal)" : "transparent",
                  color: theme === "dark" ? "#fff" : "var(--ink)",
                }}
              >
                Dark
              </button>
            </div>
          </div>
          <div>
            <button
              onClick={() => { handleClearAllChats(); setShowSettings(false); }}
              className="w-full py-2 rounded-lg text-sm border text-red-600"
              style={{ borderColor: "var(--line)" }}
            >
              Clear all chats
            </button>
          </div>
        </Modal>
      )}

      {showAbout && (
        <Modal title="About" onClose={() => setShowAbout(false)}>
          <div className="flex items-center gap-3 mb-3">
            <AnoraAvatar size={36} />
            <div>
              <p className="font-display font-semibold" style={{ color: "var(--ink)" }}>{AI_NAME}</p>
              <p className="text-xs" style={{ color: "var(--slate)" }}>Your document assistant</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
            {AI_NAME} reads the files you upload and answers your questions using only what's in
            them, citing the source document for every answer. Built with hybrid search and
            reranking for accurate retrieval.
          </p>
        </Modal>
      )}

      {citation && (
        <Modal title={citation.source} onClose={() => setCitation(null)}>
          <p className="font-mono text-xs mb-2" style={{ color: "var(--slate)" }}>
            Passage used for this answer
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--ink)" }}>
            {citation.text}
          </p>
        </Modal>
      )}
    </div>
  );
}