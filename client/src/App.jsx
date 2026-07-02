import { useState, useRef, useEffect, useCallback } from "react";
import ChatWindow from "./ChatWindow";
import AgentPanel from "./AgentPanel";
import { API_BASE, parseUsage } from "./utils";
import { CSS } from "./Styles";

export default function App() {
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [messages, setMessages] = useState([{
    id: 0, role: "ai", createdAt: new Date(), steps: [],
    content: "Xin chào! Tôi là DaisyClaw, trợ lý AI cá nhân của bạn. Bạn cần gì?",
  }]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("ready");
  const [serverOnline, setServerOnline] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sessionCost, setSessionCost] = useState(0);
  const [sessionTokens, setSessionTokens] = useState(0);

  const msgIdRef = useRef(1);
  const esRef = useRef(null);
  const startTimeRef = useRef(null);

  // Health check
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        const d = await r.json();
        setServerOnline(d.status === "ok");
      } catch { setServerOnline(false); }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  // Fetch startup briefing — chỉ 1 lần khi mở app
  useEffect(() => {
    const fetchBriefing = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/briefing`, { cache: "no-store" });
        const d = await r.json();
        if (d.status === "ok" && d.briefing) {
          setBriefing(d.briefing);
        }
      } catch { /* im lặng nếu lỗi */ }
    };
    fetchBriefing();
  }, []);

  const dismissBriefing = async () => {
    if (!briefing) return;
    const id = briefing.id;
    setBriefing(null);
    try {
      await fetch(`${API_BASE}/api/briefing/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch { /* im lặng */ }
  };

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { id: msgIdRef.current++, createdAt: new Date(), ...msg }]);
  }, []);

  const updateLastAI = useCallback((updater) => {
    setMessages(prev => {
      const next = [...prev];
      const i = next.length - 1;
      if (next[i]?.role === "ai" || next[i]?.streaming) {
        next[i] = { ...next[i], ...updater(next[i]) };
      }
      return next;
    });
  }, []);

  const uploadImage = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
      const d = await r.json();
      if (d.status !== "ok") throw new Error(d.error?.message || "Upload thất bại");
      return d.filePath;
    } finally { setUploading(false); }
  };

  const sendMessage = useCallback(async (text, imageFile) => {
    if ((!text && !imageFile) || loading || serverOnline === false) return;

    let filePath = null, imageUrl = null;
    if (imageFile) {
      try {
        imageUrl = URL.createObjectURL(imageFile);
        filePath = await uploadImage(imageFile);
      } catch (err) {
        addMessage({ role: "error", content: `Lỗi upload: ${err.message}`, steps: [] });
        return;
      }
    }

    const finalMessage = filePath
      ? (text ? `${text}\n[Ảnh: ${filePath}]\nDùng vision_ocr để đọc ảnh.` : `Dùng vision_ocr để đọc ảnh: ${filePath}`)
      : text;

    setLoading(true);
    setStatus("streaming");
    startTimeRef.current = Date.now();

    addMessage({ role: "user", content: text || "📎 Gửi ảnh", imageUrl });
    addMessage({ role: "ai", content: "", streaming: true, steps: [] });

    try {
      const url = new URL(`${API_BASE}/api/chat/stream`);
      url.searchParams.set("message", finalMessage);
      const es = new EventSource(url.toString());
      esRef.current = es;

      es.onmessage = (e) => {
        let event;
        try { event = JSON.parse(e.data); } catch { return; }
        const elapsed = Date.now() - startTimeRef.current;

        if (event.type === "token") {
          updateLastAI(msg => ({ content: msg.content + (event.text || "") }));
        } else if (event.type === "tool_call") {
          updateLastAI(msg => ({ steps: [...(msg.steps || []), { name: event.name, args: event.args }] }));
        } else if (event.type === "tool_result") {
          updateLastAI(msg => {
            const steps = [...(msg.steps || [])];
            const idx = [...steps].reverse().findIndex(s => s.name === event.name && s.result === undefined);
            if (idx !== -1) steps[steps.length - 1 - idx] = { ...steps[steps.length - 1 - idx], result: event.result };
            return { steps };
          });
        } else if (event.type === "done") {
          const usage = parseUsage(event, finalMessage, event.reply || "");
          setSessionCost(p => p + usage.cost_vnd);
          setSessionTokens(p => p + usage.input_tokens + usage.output_tokens);
          updateLastAI(() => ({ content: event.reply || "", streaming: false, elapsed, usage }));
          setStatus("ready"); setLoading(false);
          es.close(); esRef.current = null;
        } else if (event.type === "error") {
          updateLastAI(() => ({ role: "error", content: `Lỗi: ${event.error?.message || "Không xác định"}`, streaming: false, elapsed }));
          setStatus("error"); setLoading(false);
          es.close(); esRef.current = null;
        }
      };

      es.onerror = () => {
        const elapsed = Date.now() - startTimeRef.current;
        es.close(); esRef.current = null;
        updateLastAI(msg => msg.content?.length > 0
          ? { streaming: false, elapsed }
          : { role: "error", content: "Mất kết nối server.", streaming: false, elapsed }
        );
        setStatus("error"); setLoading(false);
      };
    } catch (err) {
      updateLastAI(() => ({ role: "error", content: err.message, streaming: false }));
      setStatus("error"); setLoading(false);
    }
  }, [loading, serverOnline, addMessage, updateLastAI]);

  const clearChat = () => {
    esRef.current?.close(); esRef.current = null;
    setMessages([{ id: msgIdRef.current++, role: "ai", createdAt: new Date(), steps: [], content: "Cuộc trò chuyện mới. Tôi có thể giúp gì?" }]);
    setSessionCost(0); setSessionTokens(0);
    setStatus("ready"); setLoading(false);
  };

  const latestAIMessage = [...messages].reverse().find(m => m.role === "ai" || m.role === "error");
  const statusClass = serverOnline === false ? "error" : status === "streaming" ? "streaming" : "";
  const statusLabel = serverOnline === null ? "Đang kiểm tra..." : serverOnline === false ? "Server offline" : uploading ? "Đang upload..." : status === "streaming" ? "Đang xử lý" : "Sẵn sàng";

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <div className="logo">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L9.8 6.2H15.3L10.8 9.4L12.5 14.6L8 11.4L3.5 14.6L5.2 9.4L0.7 6.2H6.2L8 1Z" fill="currentColor"/>
              </svg>
            </div>
            <span className="header-title">DaisyClaw</span>
            <span className="header-model">gemini-2.5-flash</span>
          </div>
          <div className="header-right">
            {(sessionCost > 0 || sessionTokens > 0) && (
              <div className="telemetry-widget">
                <div className="telemetry-item">🪙 <strong>{sessionTokens.toLocaleString()}</strong> tokens</div>
                <div className="telemetry-divider" />
                <div className="telemetry-item">💰 <strong>₫{sessionCost.toFixed(2)}</strong></div>
              </div>
            )}
            <div className={`status-dot-wrap ${statusClass}`}>
              <span className="status-dot" />
              <span>{statusLabel}</span>
            </div>
            <button className="btn-new" onClick={clearChat} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1 6.5H12M6.5 1V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Chat mới
            </button>
          </div>
        </header>

        {serverOnline === false && (
          <div className="offline-banner">
            ⚠️ Server chưa bật — chạy <code>npm run server</code>
          </div>
        )}

        {briefing && (
          <div className="briefing-banner">
            <div className="briefing-banner-icon">📰</div>
            <div className="briefing-banner-content">
              <div className="briefing-banner-title">
                Có {briefing.doc_count} tin tức mới trong lúc bạn vắng mặt
              </div>
              <div className="briefing-banner-text">{briefing.summary}</div>
            </div>
            <button className="briefing-banner-close" onClick={dismissBriefing}>✕</button>
          </div>
        )}

        <div className="workspace-layout">
          {!panelExpanded && (
            <ChatWindow
              messages={messages}
              onSend={sendMessage}
              loading={loading}
              serverOnline={serverOnline}
              pendingImage={pendingImage}
              setPendingImage={setPendingImage}
            />
          )}
          <AgentPanel latestAIMessage={latestAIMessage} panelExpanded={panelExpanded} setPanelExpanded={setPanelExpanded} />
        </div>
      </div>
    </>
  );
}