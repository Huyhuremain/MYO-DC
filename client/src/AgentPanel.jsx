import { useState, useEffect } from "react";
import { formatDuration, TOOL_ICONS, API_BASE } from "./utils";

// ── ToolStep ──────────────────────────────────────────────────────────────────

function ToolStep({ step }) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = step.result !== undefined && step.result !== null;
  const isRunning = !hasResult;

  return (
    <div className={`tool-step ${isRunning ? "tool-step--running" : "tool-step--done"}`}>
      <button className="tool-step-header" onClick={() => hasResult && setExpanded(!expanded)}>
        <span className="tool-step-icon">
          {isRunning ? <span className="spin">⟳</span> : <span className="check">✓</span>}
        </span>
        <span>{TOOL_ICONS[step.name] || "⚙️"}</span>
        <span className="tool-step-name">{step.name}</span>
        {step.args && Object.keys(step.args).length > 0 && (
          <span className="tool-step-arg">
            ({Object.values(step.args).join(", ").slice(0, 40)})
          </span>
        )}
        {hasResult && <span className="tool-step-toggle">{expanded ? "▲" : "▼"}</span>}
      </button>
      {expanded && hasResult && (
        <div className="tool-step-result">
          <pre>{String(step.result).slice(0, 1200)}{String(step.result).length > 1200 ? "…" : ""}</pre>
        </div>
      )}
    </div>
  );
}

// ── ExecutionLog ──────────────────────────────────────────────────────────────

function ExecutionLog({ msg }) {
  if (!msg) {
    return <div className="empty-panel-state"><p>Chưa có tác vụ thực thi nào.</p></div>;
  }

  const { steps = [], elapsed, streaming, usage } = msg;
  const done = !streaming && elapsed !== undefined;

  if (steps.length === 0) {
    return (
      <div className="empty-panel-state">
        <p>{done ? "✅ Tác vụ hoàn thành — không dùng tools." : "⚙️ Agent đang xử lý..."}</p>
      </div>
    );
  }

  return (
    <div className="process-log">
      <div className="process-log-header">
        <span className="process-log-label">
          {done ? "✅ Hoàn thành" : "⚙️ Đang thực thi..."}
        </span>
        {elapsed != null && (
          <span className="process-log-time">{formatDuration(elapsed)}</span>
        )}
      </div>
      <div className="process-log-steps">
        {steps.map((step, i) => <ToolStep key={i} step={step} />)}
      </div>
      {usage && (usage.input_tokens > 0 || usage.output_tokens > 0) && (
        <div className="step-usage-footer">
          <div className="usage-metric">📥 Input: <strong>{usage.input_tokens.toLocaleString()}</strong> tokens</div>
          <div className="usage-metric">📤 Output: <strong>{usage.output_tokens.toLocaleString()}</strong> tokens</div>
          {usage.cost_vnd > 0 && (
            <div className="usage-metric cost">💰 Chi phí: <strong>₫{usage.cost_vnd.toFixed(2)}</strong></div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MemoryTab ─────────────────────────────────────────────────────────────────

function MemoryTab() {
  return (
    <div className="dashboard-list">
      <div className="dashboard-item">
        <div className="dashboard-item-title">STATE: MEMORY.md</div>
        <div className="dashboard-item-desc">
          Liên kết với tool <code>save_memory</code>. Thông tin được ghi nhớ tự động lưu vào file này.
        </div>
      </div>
      <div className="empty-panel-state" style={{ height: "auto", padding: "20px 0" }}>
        <p style={{ fontSize: "12px" }}>
          Gõ "Ghi nhớ: tôi là lập trình viên" để kiểm tra tính năng ghi nhớ.
        </p>
      </div>
    </div>
  );
}

// ── UrlsTab ───────────────────────────────────────────────────────────────────

function UrlsTab() {
  return (
    <div className="dashboard-list">
      <div className="dashboard-item">
        <div className="dashboard-item-title">MONITORED CHANNELS</div>
        <div className="dashboard-item-desc">
          Liên kết với <code>manage_watched_urls</code> và <code>query_knowledge_base</code>.
          Crawl tự động lúc 7h sáng mỗi ngày.
        </div>
      </div>
    </div>
  );
}

// ── KnowledgeBaseTab ──────────────────────────────────────────────────────────
//
// Thiết kế lại: danh sách document và phần xem chunks tách thành 2 lớp riêng
// (drawer trượt từ phải, đè lên danh sách) thay vì accordion-mở-rộng-tại-chỗ.
// Đây là nguyên nhân gốc của lỗi "mở 1 doc làm các doc khác bé xíu lại":
// flexbox column co (shrink) các sibling card khi tổng chiều cao vượt khung
// chứa, dù container có overflow-y: auto. Tách lớp giúp danh sách không bao
// giờ bị ảnh hưởng bởi nội dung chunks.

function DocStatusPill({ status }) {
  if (!status) return null;
  const ok = status === "success";
  return (
    <span className={`kb-pill ${ok ? "kb-pill--ok" : "kb-pill--err"}`}>
      <span className="kb-pill-dot" />
      {ok ? "Crawl OK" : "Crawl lỗi"}
    </span>
  );
}

function DocSkeleton() {
  return (
    <div className="kb-skeleton-card">
      <div className="kb-skeleton-icon" />
      <div className="kb-skeleton-lines">
        <div className="kb-skeleton-line kb-skeleton-line--w70" />
        <div className="kb-skeleton-line kb-skeleton-line--w40" />
      </div>
    </div>
  );
}

function ChunkDrawer({ doc, chunks, loading, error, onClose }) {
  const filename = doc ? doc.filename : "";
  const url = doc ? doc.url : null;

  return (
    <div className={`kb-drawer ${doc ? "kb-drawer--open" : ""}`}>
      <div className="kb-drawer-header">
        <button className="kb-drawer-back" onClick={onClose} aria-label="Đóng">
          ←
        </button>
        <div className="kb-drawer-title">
          <div className="kb-drawer-filename">{filename}</div>
          {url && <div className="kb-drawer-url">{url}</div>}
        </div>
      </div>

      <div className="kb-drawer-body">
        {loading ? (
          <div className="kb-chunk-loading">⏳ Đang tải chunks...</div>
        ) : error ? (
          <div className="kb-chunk-empty">❌ {error}</div>
        ) : chunks.length === 0 ? (
          <div className="kb-chunk-empty">Document này chưa có chunks.</div>
        ) : (
          <div className="kb-chunk-list">
            {chunks.map(chunk => (
              <div key={chunk.chunk_index} className="kb-chunk">
                <div className="kb-chunk-index">#{chunk.chunk_index + 1}</div>
                <div className="kb-chunk-text">{chunk.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KnowledgeBaseTab() {
  const [docs, setDocs] = useState([]);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");

  useEffect(() => { fetchDocs(); }, [filterDate]);

  async function fetchDocs() {
    setLoading(true); setError(null);
    try {
      const url = filterDate
        ? `${API_BASE}/api/kb?date=${filterDate}`
        : `${API_BASE}/api/kb`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.status !== "ok") throw new Error(d.message);
      setDocs(d.docs || []);
      setDates(d.dates || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchChunks(docId) {
    if (selectedDocId === docId) { setSelectedDocId(null); setChunks([]); return; }
    setSelectedDocId(docId);
    setChunksLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/kb?doc_id=${encodeURIComponent(docId)}`);
      const d = await r.json();
      if (d.status !== "ok") throw new Error(d.message);
      setChunks(d.chunks || []);
    } catch { setChunks([]); }
    finally { setChunksLoading(false); }
  }

  const filteredDocs = docs.filter(d =>
    !search ||
    d.filename.toLowerCase().includes(search.toLowerCase()) ||
    (d.url && d.url.toLowerCase().includes(search.toLowerCase())) ||
    (d.label && d.label.toLowerCase().includes(search.toLowerCase()))
  );

  const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);

  if (loading) return <div className="empty-panel-state"><p>⏳ Đang tải...</p></div>;
  if (error) return <div className="empty-panel-state"><p>❌ {error}</p></div>;
  if (docs.length === 0 && !filterDate) return (
    <div className="empty-panel-state">
      <p>Knowledge base đang trống.</p>
      <p style={{ fontSize: "12px", marginTop: 4 }}>Crawl trang web để bắt đầu.</p>
    </div>
  );

  return (
    <div className="kb-tab">
      <div className="kb-toolbar">
        <input
          className="kb-search"
          placeholder="Tìm document..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="kb-refresh" onClick={fetchDocs} title="Làm mới">↻</button>
      </div>

      {dates.length > 0 && (
        <div className="kb-date-filter">
          <button
            className={`kb-date-btn ${!filterDate ? "kb-date-btn--active" : ""}`}
            onClick={() => setFilterDate("")}
          >Tất cả</button>
          {dates.map(d => (
            <button
              key={d}
              className={`kb-date-btn ${filterDate === d ? "kb-date-btn--active" : ""}`}
              onClick={() => setFilterDate(d)}
            >{d}</button>
          ))}
        </div>
      )}

      <div className="kb-stats">
        {filteredDocs.length} documents · {totalChunks.toLocaleString()} chunks
        {filterDate && <span className="kb-filter-badge"> · {filterDate}</span>}
      </div>

      <div className="kb-list">
        {filteredDocs.length === 0 ? (
          <div className="empty-panel-state" style={{ height: "auto", padding: "20px" }}>
            <p>Không có document nào cho ngày này.</p>
          </div>
        ) : filteredDocs.map(doc => (
          <div key={doc.id} className="kb-doc">
            <button
              className={`kb-doc-header ${selectedDocId === doc.id ? "kb-doc-header--open" : ""}`}
              onClick={() => fetchChunks(doc.id)}
            >
              <span className="kb-doc-icon">🗄️</span>
              <div className="kb-doc-info">
                <div className="kb-doc-name">{doc.label || doc.filename}</div>
                {doc.url && <div className="kb-doc-url">{doc.url}</div>}
                <div className="kb-doc-meta">
                  {doc.chunk_count} chunks · {doc.crawl_date} · {new Date(doc.ingested_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <span className="kb-doc-toggle">{selectedDocId === doc.id ? "▲" : "▼"}</span>
            </button>

            {selectedDocId === doc.id && (
              <div className="kb-chunks">
                {chunksLoading ? (
                  <div className="kb-chunk-loading">⏳ Đang tải...</div>
                ) : chunks.length === 0 ? (
                  <div className="kb-chunk-empty">Không có chunks.</div>
                ) : chunks.map(chunk => (
                  <div key={chunk.chunk_index} className="kb-chunk">
                    <div className="kb-chunk-index">#{chunk.chunk_index + 1}</div>
                    <div className="kb-chunk-text">{chunk.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AgentPanel (export) ───────────────────────────────────────────────────────

export default function AgentPanel({ latestAIMessage, panelExpanded, setPanelExpanded }) {
  const [activeTab, setActiveTab] = useState("execution");

  const tabs = [
    { id: "execution", label: "⚙️ Thực thi" },
    { id: "kb",        label: "🗄️ Knowledge Base" },
    { id: "stats",     label: "📊 Thống kê" },
    { id: "memory",    label: "💾 Ký ức" },
    { id: "urls",      label: "📡 URLs" },
  ];

  return (
    <div className={`agent-panel ${panelExpanded ? "agent-panel--expanded" : ""}`}>
      <div className="panel-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          className="tab-btn panel-expand-btn"
          onClick={() => setPanelExpanded(p => !p)}
          title={panelExpanded ? "Thu nhỏ" : "Mở rộng"}
        >
          {panelExpanded ? "⊠" : "⊞"}
        </button>
      </div>
      <div className="panel-content">
        {activeTab === "execution" && <ExecutionLog msg={latestAIMessage} />}
        {activeTab === "kb"        && <KnowledgeBaseTab />}
        {activeTab === "memory"    && <MemoryTab />}
        {activeTab === "urls"      && <UrlsTab />}
        {activeTab === "stats"     && <StatsTab />}
      </div>
    </div>
  );

  // ── StatsTab ──────────────────────────────────────────────────────────────────

function StatsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  useEffect(() => { fetchStats(); }, [period]);

  async function fetchStats() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/stats?period=${period}`);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.message);
      setStats(d);
    } catch (err) {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  const periods = [
    { id: 'today', label: 'Hôm nay' },
    { id: 'week',  label: '7 ngày' },
    { id: 'month', label: 'Tháng này' },
    { id: 'year',  label: 'Năm nay' },
    { id: 'all',   label: 'Tất cả' },
  ];

  return (
    <div className="stats-tab">
      <div className="stats-period-bar">
        {periods.map(p => (
          <button
            key={p.id}
            className={`stats-period-btn ${period === p.id ? 'stats-period-btn--active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >{p.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="empty-panel-state"><p>⏳ Đang tải...</p></div>
      ) : !stats ? (
        <div className="empty-panel-state"><p>Chưa có dữ liệu.</p></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="stats-cards">
            <div className="stats-card">
              <div className="stats-card-label">Tổng calls</div>
              <div className="stats-card-value">{stats.summary.total_calls.toLocaleString()}</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-label">Input tokens</div>
              <div className="stats-card-value">{stats.summary.total_input.toLocaleString()}</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-label">Output tokens</div>
              <div className="stats-card-value">{stats.summary.total_output.toLocaleString()}</div>
            </div>
            <div className="stats-card stats-card--cost">
              <div className="stats-card-label">Chi phí</div>
              <div className="stats-card-value">₫{(stats.summary.total_cost || 0).toFixed(2)}</div>
            </div>
          </div>

          {/* Monthly breakdown */}
          {stats.monthly.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">Theo tháng</div>
              <div className="stats-table">
                <div className="stats-table-header">
                  <span>Tháng</span>
                  <span>Calls</span>
                  <span>Tokens</span>
                  <span>Chi phí</span>
                </div>
                {stats.monthly.map(row => (
                  <div key={row.month} className="stats-table-row">
                    <span>{row.month}</span>
                    <span>{row.calls.toLocaleString()}</span>
                    <span>{(row.input_tokens + row.output_tokens).toLocaleString()}</span>
                    <span>₫{(row.cost_vnd || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily breakdown */}
          {stats.daily.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">Theo ngày</div>
              <div className="stats-table">
                <div className="stats-table-header">
                  <span>Ngày</span>
                  <span>Calls</span>
                  <span>Tokens</span>
                  <span>Chi phí</span>
                </div>
                {stats.daily.map(row => (
                  <div key={row.date} className="stats-table-row">
                    <span>{row.date}</span>
                    <span>{row.calls.toLocaleString()}</span>
                    <span>{(row.input_tokens + row.output_tokens).toLocaleString()}</span>
                    <span>₫{(row.cost_vnd || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
}