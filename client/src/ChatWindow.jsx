import { useState, useRef, useEffect, useCallback } from "react";
import { formatTime, API_BASE, ACCEPTED_IMAGE_TYPES, TOOL_ICONS } from "./utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ImagePreview({ file, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="img-preview">
      {url && <img src={url} alt={file.name} />}
      <span className="img-preview-name">{file.name}</span>
      <button className="img-preview-remove" onClick={onRemove}>✕</button>
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
        {msg.imageUrl && (
          <div className="bubble-image">
            <img src={msg.imageUrl} alt="Ảnh đính kèm" />
          </div>
        )}
        {!isUser && msg.streaming && msg.steps?.length > 0 && !msg.content && (
          <div className="mini-agent-status">
            <span className="spin-mini">⟳</span> Agent đang thực thi tools...
          </div>
        )}
        {!isUser && msg.streaming && !msg.content && (!msg.steps || msg.steps.length === 0) && (
          <div className="typing-bubble"><span /><span /><span /></div>
        )}
        {msg.content && (
          <div className="bubble-text">
            {msg.content}
            {msg.streaming && <span className="cursor" />}
          </div>
        )}
        <div className="bubble-meta-row">
          <span className="bubble-time">{formatTime(msg.createdAt)}</span>
          {!isUser && msg.usage?.cost_vnd > 0 && (
            <span className="bubble-cost-tag">₫{msg.usage.cost_vnd.toFixed(2)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ChatInput ─────────────────────────────────────────────────────────────────

function ChatInput({ onSend, disabled, serverOnline, pendingImage, setPendingImage }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSend = () => {
    const text = input.trim();
    if ((!text && !pendingImage) || disabled) return;
    onSend(text, pendingImage);
    setInput("");
    setPendingImage(null);
    inputRef.current?.style && (inputRef.current.style.height = "auto");
  };

  const canSend = (input.trim() || pendingImage) && !disabled;

  return (
    <div className="input-wrap">
      <div className="input-inner">
        {pendingImage && (
          <ImagePreview file={pendingImage} onRemove={() => setPendingImage(null)} />
        )}
        <div className={`input-box ${disabled ? "disabled" : ""}`}>
          <input
            ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES}
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingImage(f); e.target.value = ""; }}
          />
          <button
            className={`btn-upload ${pendingImage ? "has-file" : ""}`}
            onClick={() => fileInputRef.current?.click()} disabled={disabled}
            title="Đính kèm ảnh"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="5.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 10L5 7L8 10L11 7.5L15 11" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </button>
          <textarea
            ref={inputRef} value={input} rows={1} disabled={disabled}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              serverOnline === null ? "Đang kiểm tra server..." :
              serverOnline === false ? "Server offline" :
              pendingImage ? "Thêm ghi chú cho ảnh..." :
              "Nhắn tin với DaisyClaw..."
            }
          />
          <button className="btn-send" onClick={handleSend} disabled={!canSend} title="Gửi (Enter)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 12V2M2 7L7 2L12 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="input-hint">
          {serverOnline === false
            ? "⚠️ Chạy npm run server để bắt đầu"
            : "Enter để gửi · Shift+Enter xuống dòng · 📎 đính kèm ảnh để OCR"}
        </div>
      </div>
    </div>
  );
}

// ── MessageList ───────────────────────────────────────────────────────────────

function MessageList({ messages }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="messages">
      {messages.map((msg) => <Message key={msg.id} msg={msg} />)}
      <div ref={bottomRef} />
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onChip, disabled }) {
  const chips = [
    "Bây giờ là mấy giờ?",
    "Tính 15% của 2,500,000",
    "Tìm tin tức AI hôm nay",
    "Ghi nhớ: tôi thích cà phê đen",
  ];
  return (
    <div className="empty-state">
      <div className="empty-logo">
        <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
          <path d="M8 1L9.8 6.2H15.3L10.8 9.4L12.5 14.6L8 11.4L3.5 14.6L5.2 9.4L0.7 6.2H6.2L8 1Z" fill="currentColor"/>
        </svg>
      </div>
      <div className="empty-title">Trợ lý Agent của bạn sẵn sàng</div>
      <div className="empty-sub">Tìm kiếm web, tính toán, ghi nhớ thông tin, đọc ảnh và nhiều hơn nữa.</div>
      <div className="empty-chips">
        {chips.map((s) => (
          <button key={s} className="chip" disabled={disabled} onClick={() => onChip(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

// ── ChatWindow (export) ───────────────────────────────────────────────────────

export default function ChatWindow({ messages, onSend, loading, serverOnline, pendingImage, setPendingImage }) {
  const isEmpty = messages.length === 1 && messages[0].role === "ai";
  const inputDisabled = loading || serverOnline === false;

  const handleChip = useCallback((text) => {
    onSend(text, null);
  }, [onSend]);

  return (
    <div className="chat-panel">
      {isEmpty
        ? <EmptyState onChip={handleChip} disabled={inputDisabled} />
        : <MessageList messages={messages} />
      }
      <ChatInput
        onSend={onSend}
        disabled={inputDisabled}
        serverOnline={serverOnline}
        pendingImage={pendingImage}
        setPendingImage={setPendingImage}
      />
    </div>
  );
}