import { useState, useRef, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:3000";
const ACCEPTED_IMAGE_TYPES = ".jpg,.jpeg,.png,.bmp,.tiff,.webp,.gif";

function formatTime(date) {
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function ToolBadge({ name }) {
  return (
    <span className="tool-badge">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="5" cy="5" r="1.5" fill="currentColor"/>
      </svg>
      {name}
    </span>
  );
}

function ImagePreview({ file, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const objUrl = URL.createObjectURL(file);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [file]);

  return (
    <div className="img-preview">
      {url && <img src={url} alt={file.name} />}
      <span className="img-preview-name">{file.name}</span>
      <button className="img-preview-remove" onClick={onRemove} title="Xóa ảnh">✕</button>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  const isError = msg.role === "error";
  return (
    <div className={`msg-row ${isUser ? "msg-row--user" : "msg-row--ai"}`}>
      {!isUser && (
        <div className="avatar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L9.8 6.2H15.3L10.8 9.4L12.5 14.6L8 11.4L3.5 14.6L5.2 9.4L0.7 6.2H6.2L8 1Z" fill="currentColor"/>
          </svg>
        </div>
      )}
      <div className={`bubble ${isUser ? "bubble--user" : isError ? "bubble--error" : "bubble--ai"}`}>
        {/* Hiển thị ảnh đã gửi kèm */}
        {msg.imageUrl && (
          <div className="bubble-image">
            <img src={msg.imageUrl} alt="Ảnh đính kèm" />
          </div>
        )}
        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
          <div className="tools-row">
            <span className="tools-label">Đã dùng:</span>
            {msg.toolsUsed.map((t, i) => <ToolBadge key={i} name={t} />)}
          </div>
        )}
        {msg.content && (
          <p className="bubble-text">
            {msg.content}
            {msg.streaming && <span className="cursor" />}
          </p>
        )}
        <span className="bubble-time">{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: "ai",
      content: "Xin chào! Tôi là DaisyClaw, trợ lý AI cá nhân của bạn. Tôi có thể đọc trang web, tính toán, ghi nhớ thông tin, nhận dạng chữ trong ảnh và nhiều hơn nữa. Bạn cần gì?",
      createdAt: new Date(),
      toolsUsed: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("ready");
  const [serverOnline, setServerOnline] = useState(null);
  const [pendingImage, setPendingImage] = useState(null); // File object chờ upload
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const msgIdRef = useRef(1);
  const esRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Health check
  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, {
          signal: AbortSignal.timeout(5000),
          cache: 'no-store',
        });
        const data = await res.json();
        setServerOnline(data.status === "ok");
      } catch {
        setServerOnline(false);
      }
    };
    checkServer();
    const interval = setInterval(checkServer, 30000);
    return () => clearInterval(interval);
  }, []);

  const addMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, { id: msgIdRef.current++, createdAt: new Date(), ...msg }]);
  }, []);

  const updateLastAI = useCallback((updater) => {
    setMessages((prev) => {
      const next = [...prev];
      const lastIdx = next.length - 1;
      if (next[lastIdx]?.role === "ai" || next[lastIdx]?.streaming) {
        next[lastIdx] = { ...next[lastIdx], ...updater(next[lastIdx]) };
      }
      return next;
    });
  }, []);

  // Upload ảnh lên server, trả về filePath
  const uploadImage = async (file) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.status !== "ok") throw new Error(data.error?.message || "Upload thất bại");
      return data.filePath; // ví dụ: "data/uploads/1234567890.jpg"
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || loading || serverOnline === false) return;

    // Upload ảnh trước nếu có
    let filePath = null;
    let imageUrl = null;
    if (pendingImage) {
      try {
        // Tạo preview URL trước khi clear
        imageUrl = URL.createObjectURL(pendingImage);
        filePath = await uploadImage(pendingImage);
      } catch (err) {
        addMessage({
          role: "error",
          content: `Lỗi upload ảnh: ${err.message}`,
          toolsUsed: [],
        });
        return;
      }
      setPendingImage(null);
    }

    // Build message gửi đến agent
    let finalMessage = text;
    if (filePath) {
      const imageNote = filePath
        ? `\n[Ảnh đính kèm: ${filePath}]\nHãy dùng tool vision_ocr để đọc nội dung ảnh này.`
        : '';
      finalMessage = text ? `${text}${imageNote}` : `Hãy dùng tool vision_ocr để đọc nội dung ảnh này: ${filePath}`;
    }

    setInput("");
    setLoading(true);
    setStatus("streaming");

    // Hiển thị tin nhắn user (kèm ảnh nếu có)
    addMessage({ role: "user", content: text || "📎 Gửi ảnh để OCR", imageUrl });
    addMessage({ role: "ai", content: "", streaming: true, toolsUsed: [] });

    try {
      const url = new URL(`${API_BASE}/api/chat/stream`);
      url.searchParams.set("message", finalMessage);

      const eventSource = new EventSource(url.toString());
      esRef.current = eventSource;

      eventSource.onmessage = (e) => {
        const event = JSON.parse(e.data);
        switch (event.type) {
          case "token":
            updateLastAI((msg) => ({ content: msg.content + event.text }));
            break;
          case "tool_call":
            updateLastAI((msg) => ({
              toolsUsed: [...(msg.toolsUsed || []), event.name],
            }));
            break;
          case "done":
            updateLastAI(() => ({
              content: event.reply,
              streaming: false,
              toolsUsed: event.tools_used || [],
            }));
            setStatus("ready");
            setLoading(false);
            eventSource.close();
            esRef.current = null;
            inputRef.current?.focus();
            break;
          case "error":
            updateLastAI(() => ({
              role: "error",
              content: `Lỗi: ${event.error?.message || "Không xác định"}`,
              streaming: false,
            }));
            setStatus("error");
            setLoading(false);
            eventSource.close();
            esRef.current = null;
            break;
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        esRef.current = null;
        updateLastAI((msg) => {
          if (msg.content && msg.content.length > 0) return { streaming: false };
          return {
            role: "error",
            content: "Mất kết nối server. Thử lại sau vài giây.",
            streaming: false,
          };
        });
        setStatus("error");
        setLoading(false);
      };
    } catch (err) {
      updateLastAI(() => ({
        role: "error",
        content: err.message,
        streaming: false,
      }));
      setStatus("error");
      setLoading(false);
    }
  }, [input, pendingImage, loading, serverOnline, addMessage, updateLastAI]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) setPendingImage(file);
    e.target.value = ""; // reset input để chọn lại cùng file
  };

  const clearChat = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setPendingImage(null);
    setMessages([{
      id: msgIdRef.current++,
      role: "ai",
      content: "Cuộc trò chuyện mới bắt đầu. Tôi có thể giúp gì cho bạn?",
      createdAt: new Date(),
      toolsUsed: [],
    }]);
    setStatus("ready");
    setLoading(false);
    inputRef.current?.focus();
  };

  const statusClass =
    serverOnline === null ? "" :
    serverOnline === false ? "error" :
    status === "streaming" ? "streaming" : "";

  const statusLabel =
    serverOnline === null ? "Đang kiểm tra..." :
    serverOnline === false ? "Server offline" :
    uploading ? "Đang upload..." :
    status === "streaming" ? "Đang xử lý" : "Sẵn sàng";

  const inputDisabled = loading || serverOnline === false || uploading;
  const canSend = (input.trim() || pendingImage) && !inputDisabled;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #fff; --border: #e5e5e5; --text: #1a1a1a; --muted: #8e8ea0;
          --accent: #10a37f; --accent-h: #0d8c6d; --user-bg: #f4f4f4;
          --error-bg: #fff5f5; --error-text: #dc2626;
          --tool-bg: #f0fdf4; --tool-text: #15803d; --tool-border: #bbf7d0;
          --warn-bg: #fffbeb; --warn-text: #92400e; --warn-border: #fde68a;
          --font: 'Inter', -apple-system, sans-serif;
          --radius: 12px; --max-width: 720px;
        }
        html, body, #root { height: 100%; width: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
        .app { display: flex; flex-direction: column; height: 100vh; }

        /* Header */
        .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--bg); position: sticky; top: 0; z-index: 10; }
        .header-left { display: flex; align-items: center; gap: 10px; }
        .logo { width: 32px; height: 32px; background: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; }
        .header-title { font-size: 16px; font-weight: 600; }
        .header-model { font-size: 12px; color: var(--muted); background: var(--user-bg); padding: 3px 8px; border-radius: 20px; border: 1px solid var(--border); }
        .header-right { display: flex; align-items: center; gap: 8px; }
        .status-dot-wrap { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border); background: var(--user-bg); transition: all 0.3s; }
        .status-dot-wrap.error { border-color: #fecaca; background: var(--error-bg); color: var(--error-text); }
        .status-dot-wrap.streaming { border-color: #6ee7b7; background: #f0fdf4; color: var(--accent); }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); transition: background 0.3s; }
        .status-dot-wrap.streaming .status-dot { background: var(--accent); animation: pulse 1s infinite; }
        .status-dot-wrap.error .status-dot { background: var(--error-text); }
        .status-dot-wrap:not(.error):not(.streaming) .status-dot { background: var(--accent); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .btn-new { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text); font-family: var(--font); font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
        .btn-new:hover { background: var(--user-bg); }
        .btn-new:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Offline banner */
        .offline-banner { background: var(--warn-bg); border-bottom: 1px solid var(--warn-border); color: var(--warn-text); padding: 10px 20px; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .offline-banner code { background: rgba(0,0,0,0.07); padding: 1px 6px; border-radius: 4px; font-size: 12px; font-family: monospace; }

        /* Messages */
        .messages { flex: 1; overflow-y: auto; padding: 24px 20px 8px; display: flex; flex-direction: column; gap: 0; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .msg-row { display: flex; gap: 14px; padding: 16px 0; max-width: var(--max-width); margin: 0 auto; width: 100%; animation: fadeUp 0.2s ease; }
        .msg-row--user { flex-direction: row-reverse; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .avatar { width: 30px; height: 30px; border-radius: 8px; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
        .bubble { flex: 1; min-width: 0; }
        .bubble--user { background: var(--user-bg); border-radius: var(--radius); padding: 12px 16px; max-width: 80%; margin-left: auto; }
        .bubble--ai { padding: 2px 0; }
        .bubble--error { background: var(--error-bg); border: 1px solid #fecaca; border-radius: var(--radius); padding: 12px 16px; color: var(--error-text); }
        .bubble-text { white-space: pre-wrap; word-break: break-word; font-size: 15px; line-height: 1.7; color: var(--text); }
        .bubble-time { display: block; font-size: 11px; color: var(--muted); margin-top: 6px; }
        .bubble--user .bubble-time { text-align: right; }

        /* Ảnh trong bubble */
        .bubble-image { margin-bottom: 8px; }
        .bubble-image img { max-width: 240px; max-height: 180px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border); }

        /* Tool badges */
        .tools-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; padding: 8px 12px; background: var(--tool-bg); border: 1px solid var(--tool-border); border-radius: 8px; }
        .tools-label { font-size: 12px; color: var(--muted); font-weight: 500; }
        .tool-badge { display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; background: white; border: 1px solid var(--tool-border); font-size: 12px; font-weight: 500; color: var(--tool-text); }

        /* Cursor & typing */
        .cursor { display: inline-block; width: 2px; height: 16px; background: var(--text); margin-left: 1px; vertical-align: text-bottom; animation: blink 0.7s step-end infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .typing-bubble { display: flex; align-items: center; gap: 4px; padding: 12px 0; }
        .typing-bubble span { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); animation: bounce 1.2s infinite; }
        .typing-bubble span:nth-child(2) { animation-delay: 0.15s; }
        .typing-bubble span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-4px);opacity:1} }
        .msg-row + .msg-row--user, .msg-row--user + .msg-row--ai { border-top: 1px solid var(--border); margin-top: 4px; padding-top: 20px; }

        /* Input area */
        .input-wrap { padding: 12px 20px 20px; background: var(--bg); border-top: 1px solid var(--border); }
        .input-inner { max-width: var(--max-width); margin: 0 auto; }

        /* Image preview trên ô nhập */
        .img-preview { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--user-bg); border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--border); }
        .img-preview img { width: 48px; height: 48px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border); flex-shrink: 0; }
        .img-preview-name { font-size: 13px; color: var(--text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .img-preview-remove { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 16px; padding: 2px 4px; border-radius: 4px; transition: color 0.15s; flex-shrink: 0; }
        .img-preview-remove:hover { color: var(--error-text); }

        .input-box { display: flex; align-items: flex-end; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: border-color 0.2s, box-shadow 0.2s; }
        .input-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(16,163,127,0.1); }
        .input-box.disabled { background: var(--user-bg); opacity: 0.6; }
        textarea { flex: 1; border: none; outline: none; background: transparent; font-family: var(--font); font-size: 15px; color: var(--text); resize: none; min-height: 24px; max-height: 160px; line-height: 1.5; scrollbar-width: thin; }
        textarea::placeholder { color: var(--muted); }

        /* Nút upload ảnh */
        .btn-upload { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all 0.15s; }
        .btn-upload:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: #f0fdf4; }
        .btn-upload:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-upload.has-file { border-color: var(--accent); color: var(--accent); background: #f0fdf4; }

        .btn-send { width: 34px; height: 34px; border-radius: 8px; border: none; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: background 0.15s, transform 0.1s; }
        .btn-send:hover:not(:disabled) { background: var(--accent-h); }
        .btn-send:active:not(:disabled) { transform: scale(0.94); }
        .btn-send:disabled { background: var(--border); cursor: not-allowed; }
        .input-hint { text-align: center; font-size: 11px; color: var(--muted); margin-top: 8px; }

        /* Empty state */
        .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px 20px; }
        .empty-logo { width: 52px; height: 52px; background: var(--accent); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: white; margin-bottom: 4px; }
        .empty-title { font-size: 20px; font-weight: 600; color: var(--text); }
        .empty-sub { font-size: 14px; color: var(--muted); text-align: center; max-width: 320px; }
        .empty-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
        .chip { padding: 8px 14px; border: 1px solid var(--border); border-radius: 20px; font-size: 13px; color: var(--text); cursor: pointer; background: var(--bg); transition: background 0.15s, border-color 0.15s; }
        .chip:hover { background: var(--user-bg); border-color: var(--accent); color: var(--accent); }
        .chip:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

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
            ⚠️ Server chưa bật — mở terminal và chạy <code>npm run server</code> tại thư mục dự án
          </div>
        )}

        {/* Messages / Empty state */}
        {messages.length === 1 && messages[0].role === "ai" ? (
          <div className="empty-state">
            <div className="empty-logo">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L9.8 6.2H15.3L10.8 9.4L12.5 14.6L8 11.4L3.5 14.6L5.2 9.4L0.7 6.2H6.2L8 1Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="empty-title">Tôi có thể giúp gì cho bạn?</div>
            <div className="empty-sub">Hỏi tôi bất cứ điều gì — tôi có thể tìm kiếm web, tính toán, ghi nhớ, đọc ảnh và nhiều hơn nữa.</div>
            <div className="empty-chips">
              {[
                "Bây giờ là mấy giờ?",
                "Tính 15% của 2,500,000",
                "Đọc trang https://vnexpress.net",
                "Ghi nhớ: tôi thích cà phê đen",
              ].map((s) => (
                <button key={s} className="chip" disabled={inputDisabled}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((msg) => <Message key={msg.id} msg={msg} />)}
            {loading && messages[messages.length - 1]?.content === "" && (
              <div className="msg-row msg-row--ai" style={{maxWidth:"720px",margin:"0 auto",width:"100%"}}>
                <div className="avatar">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L9.8 6.2H15.3L10.8 9.4L12.5 14.6L8 11.4L3.5 14.6L5.2 9.4L0.7 6.2H6.2L8 1Z" fill="currentColor"/>
                  </svg>
                </div>
                <div className="bubble bubble--ai typing-bubble">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        <div className="input-wrap">
          <div className="input-inner">
            {/* Preview ảnh chờ gửi */}
            {pendingImage && (
              <ImagePreview
                file={pendingImage}
                onRemove={() => setPendingImage(null)}
              />
            )}
            <div className={`input-box ${inputDisabled ? "disabled" : ""}`}>
              {/* Input file ẩn */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              {/* Nút upload ảnh */}
              <button
                className={`btn-upload ${pendingImage ? "has-file" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                disabled={inputDisabled}
                title="Đính kèm ảnh để OCR"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="5.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M1 10L5 7L8 10L11 7.5L15 11" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  serverOnline === null ? "Đang kiểm tra server..." :
                  serverOnline === false ? "Server offline — hãy chạy npm run server" :
                  pendingImage ? "Thêm ghi chú cho ảnh (tuỳ chọn)..." :
                  "Nhắn tin với DaisyClaw..."
                }
                rows={1}
                disabled={inputDisabled}
              />
              <button className="btn-send" onClick={sendMessage}
                disabled={!canSend} title="Gửi (Enter)">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 12V2M2 7L7 2L12 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="input-hint">
              {serverOnline === false ? "⚠️ Chạy npm run server để bắt đầu" :
               "Enter để gửi · Shift+Enter xuống dòng · 📎 đính kèm ảnh để OCR"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}