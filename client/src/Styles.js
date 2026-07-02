export const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #fff; --border: #e5e5e5; --text: #1a1a1a; --muted: #8e8ea0;
    --accent: #10a37f; --accent-h: #0d8c6d;
    --user-bg: #f4f4f4; --error-bg: #fff5f5; --error-text: #dc2626;
    --tool-bg: #f8fffe; --tool-border: #d1fae5; --tool-text: #065f46;
    --tool-running-bg: #fffbeb; --tool-running-border: #fde68a;
    --warn-bg: #fffbeb; --warn-border: #fde68a; --warn-text: #92400e;
    --mono: 'JetBrains Mono', monospace;
    --font: 'Inter', -apple-system, sans-serif;
    --radius: 12px; --max-width: 720px;
    --panel-right-bg: #f9fafb;
  }
  html, body, #root { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
  .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

  /* Header */
  .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--bg); z-index: 10; height: 56px; }
  .header-left { display: flex; align-items: center; gap: 10px; }
  .logo { width: 32px; height: 32px; background: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; }
  .header-title { font-size: 16px; font-weight: 600; }
  .header-model { font-size: 12px; color: var(--muted); background: var(--user-bg); padding: 3px 8px; border-radius: 20px; border: 1px solid var(--border); }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .telemetry-widget { display: flex; align-items: center; gap: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 4px 12px; border-radius: 8px; font-size: 12px; color: #166534; }
  .telemetry-item { display: flex; align-items: center; gap: 4px; }
  .telemetry-divider { width: 1px; height: 12px; background: #bbf7d0; }
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
  .offline-banner { background: var(--warn-bg); border-bottom: 1px solid var(--warn-border); color: var(--warn-text); padding: 8px 20px; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .offline-banner code { background: rgba(0,0,0,0.07); padding: 1px 6px; border-radius: 4px; font-size: 12px; font-family: monospace; }

  /* Layout */
  .workspace-layout { display: flex; flex: 1; overflow: hidden; width: 100%; }
  .chat-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); border-right: 1px solid var(--border); }
  .agent-panel { width: 440px; display: flex; flex-direction: column; overflow: hidden; background: var(--panel-right-bg); }

  /* Messages */
  .messages { flex: 1; overflow-y: auto; padding: 24px 20px; display: flex; flex-direction: column; gap: 0; scrollbar-width: thin; }
  .msg-row { display: flex; gap: 14px; padding: 16px 0; max-width: var(--max-width); margin: 0 auto; width: 100%; animation: fadeUp 0.2s ease; }
  .msg-row--user { flex-direction: row-reverse; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .avatar { width: 30px; height: 30px; border-radius: 8px; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .bubble { flex: 1; min-width: 0; }
  .bubble--user { background: var(--user-bg); border-radius: var(--radius); padding: 12px 16px; max-width: 85%; margin-left: auto; }
  .bubble--ai { padding: 2px 0; }
  .bubble--error { background: var(--error-bg); border: 1px solid #fecaca; border-radius: var(--radius); padding: 12px 16px; color: var(--error-text); }
  .bubble-text { white-space: pre-wrap; word-break: break-word; font-size: 15px; line-height: 1.7; color: var(--text); }
  .bubble-meta-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .bubble-time { font-size: 11px; color: var(--muted); }
  .bubble--user .bubble-meta-row { justify-content: flex-end; }
  .bubble-cost-tag { font-size: 10px; font-weight: 600; color: #166534; background: #dcfce7; padding: 1px 5px; border-radius: 4px; font-family: var(--mono); }
  .bubble-image { margin-bottom: 8px; }
  .bubble-image img { max-width: 240px; max-height: 180px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border); }
  .mini-agent-status { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--accent); background: #f0fdf4; padding: 6px 12px; border-radius: 8px; border: 1px solid #bbf7d0; margin-bottom: 6px; }
  .spin-mini { display: inline-block; animation: spin 1s linear infinite; font-weight: bold; }
  .cursor { display: inline-block; width: 2px; height: 16px; background: var(--text); margin-left: 1px; vertical-align: text-bottom; animation: blink 0.7s step-end infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  .typing-bubble { display: flex; align-items: center; gap: 4px; padding: 12px 0; }
  .typing-bubble span { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); animation: bounce 1.2s infinite; }
  .typing-bubble span:nth-child(2) { animation-delay: 0.15s; }
  .typing-bubble span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-4px);opacity:1} }
  .msg-row + .msg-row--user, .msg-row--user + .msg-row--ai { border-top: 1px solid var(--border); margin-top: 4px; padding-top: 20px; }

  /* Input */
  .input-wrap { padding: 16px 20px 20px; background: var(--bg); border-top: 1px solid var(--border); }
  .input-inner { max-width: var(--max-width); margin: 0 auto; }
  .img-preview { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--user-bg); border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--border); }
  .img-preview img { width: 48px; height: 48px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border); flex-shrink: 0; }
  .img-preview-name { font-size: 13px; color: var(--text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .img-preview-remove { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 16px; padding: 2px 4px; border-radius: 4px; flex-shrink: 0; }
  .img-preview-remove:hover { color: var(--error-text); }
  .input-box { display: flex; align-items: flex-end; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: border-color 0.2s, box-shadow 0.2s; }
  .input-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(16,163,127,0.08); }
  .input-box.disabled { background: var(--user-bg); opacity: 0.6; }
  textarea { flex: 1; border: none; outline: none; background: transparent; font-family: var(--font); font-size: 15px; color: var(--text); resize: none; min-height: 24px; max-height: 120px; line-height: 1.5; scrollbar-width: thin; }
  textarea::placeholder { color: var(--muted); }
  .btn-upload { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all 0.15s; }
  .btn-upload:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: #f0fdf4; }
  .btn-upload:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-upload.has-file { border-color: var(--accent); color: var(--accent); background: #f0fdf4; }
  .btn-send { width: 34px; height: 34px; border-radius: 8px; border: none; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: background 0.15s, transform 0.1s; }
  .btn-send:hover:not(:disabled) { background: var(--accent-h); }
  .btn-send:active:not(:disabled) { transform: scale(0.94); }
  .btn-send:disabled { background: var(--border); cursor: not-allowed; }
  .input-hint { text-align: center; font-size: 11px; color: var(--muted); margin-top: 8px; }

  /* Agent Panel */
  .panel-tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--bg); padding: 4px 12px 0; gap: 4px; }
  .tab-btn { background: transparent; border: none; padding: 10px 14px; font-family: var(--font); font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
  .tab-btn:hover { color: var(--text); }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
  .panel-content { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; }
  .empty-panel-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--muted); font-size: 13px; text-align: center; padding: 40px; gap: 10px; }

  /* Process log */
  .process-log { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
  .process-log-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed var(--border); }
  .process-log-label { font-size: 13px; font-weight: 600; color: var(--text); }
  .process-log-time { font-size: 11px; color: var(--muted); font-family: var(--mono); background: var(--user-bg); border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px; }
  .process-log-steps { display: flex; flex-direction: column; gap: 8px; }
  .tool-step { border-radius: 8px; overflow: hidden; border: 1px solid var(--border); transition: all 0.2s; }
  .tool-step--running { border-color: var(--tool-running-border); background: var(--tool-running-bg); box-shadow: 0 0 0 1px var(--tool-running-border); }
  .tool-step--done { background: white; }
  .tool-step-header { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: transparent; border: none; font-family: var(--font); font-size: 13px; cursor: pointer; text-align: left; }
  .tool-step--done .tool-step-header:hover { background: #f8fafc; }
  .tool-step-icon { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
  .spin { display: inline-block; color: #d97706; animation: spin 1s linear infinite; font-weight: bold; }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  .check { color: var(--accent); font-weight: 700; }
  .tool-step-name { font-weight: 600; color: #334155; font-family: var(--mono); font-size: 12.5px; }
  .tool-step-arg { color: var(--muted); font-family: var(--mono); font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 4px; }
  .tool-step-toggle { margin-left: auto; font-size: 10px; color: var(--muted); }
  .tool-step-result { padding: 12px; border-top: 1px solid var(--border); background: #0f172a; }
  .tool-step-result pre { font-family: var(--mono); font-size: 11.5px; color: #e2e8f0; white-space: pre-wrap; word-break: break-all; line-height: 1.6; max-height: 320px; overflow-y: auto; scrollbar-width: thin; }
  .step-usage-footer { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #475569; }
  .usage-metric strong { font-family: var(--mono); color: var(--text); }
  .usage-metric.cost { color: #15803d; font-weight: 500; margin-top: 2px; background: #f0fdf4; padding: 4px 8px; border-radius: 6px; border: 1px solid #bbf7d0; width: fit-content; }

  /* Dashboard */
  .dashboard-list { display: flex; flex-direction: column; gap: 8px; }
  .dashboard-item { background: white; border: 1px solid var(--border); padding: 10px 12px; border-radius: 8px; font-size: 13px; }
  .dashboard-item-title { font-weight: 600; font-family: var(--mono); font-size: 12px; color: #334155; margin-bottom: 4px; }
  .dashboard-item-desc { color: var(--muted); font-size: 12px; }

  /* Empty state */
  .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px 20px; }
  .empty-logo { width: 52px; height: 52px; background: var(--accent); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: white; margin-bottom: 4px; }
  .empty-title { font-size: 20px; font-weight: 600; }
  .empty-sub { font-size: 14px; color: var(--muted); text-align: center; max-width: 400px; }
  .empty-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; max-width: 500px; }
  .chip { padding: 8px 14px; border: 1px solid var(--border); border-radius: 20px; font-size: 13px; color: var(--text); cursor: pointer; background: var(--bg); transition: background 0.15s, border-color 0.15s; }
  .chip:hover { background: var(--user-bg); border-color: var(--accent); color: var(--accent); }
  .chip:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Knowledge Base Tab ─────────────────────────────────────────────────
     Layout: header (title/refresh + stat pills + search) stays fixed; the
     doc list scrolls in its own region; the chunk viewer is a drawer that
     slides in ABOVE the list (absolute, full-bleed) instead of expanding
     inline. This is what fixes the "other docs shrink to nothing" bug —
     no flex sibling is ever resized by chunk content anymore. */

  .kb-tab { position: relative; display: flex; flex-direction: column; height: 100%; gap: 12px; overflow: hidden; }

  .kb-head { flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
  .kb-head-top { display: flex; align-items: center; justify-content: space-between; }
  .kb-title { font-size: 14px; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
  .kb-refresh { width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border); background: var(--bg); color: var(--muted); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .kb-refresh:hover { color: var(--accent); border-color: var(--accent); background: #f0fdf4; }
  .kb-refresh--spinning { animation: spin 0.8s linear infinite; color: var(--accent); }

  .kb-stat-row { display: flex; gap: 6px; }
  .kb-stat-pill { font-size: 11px; color: var(--muted); background: var(--bg); border: 1px solid var(--border); padding: 4px 9px; border-radius: 20px; }
  .kb-stat-pill strong { color: var(--text); font-family: var(--mono); font-weight: 600; }

  .kb-search-wrap { position: relative; display: flex; align-items: center; }
  .kb-search-icon { position: absolute; left: 10px; font-size: 12px; opacity: 0.5; pointer-events: none; }
  .kb-search { width: 100%; padding: 8px 10px 8px 30px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 12.5px; font-family: var(--font); transition: border-color 0.15s, box-shadow 0.15s; }
  .kb-search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(16,163,127,0.08); }

  .kb-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 2px; scrollbar-width: thin; }

  .kb-doc { flex-shrink: 0; width: 100%; display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); cursor: pointer; text-align: left; font-family: var(--font); transition: border-color 0.15s, background 0.15s, transform 0.1s; }
  .kb-doc:hover { border-color: var(--accent); background: #f0fdf4; }
  .kb-doc:active { transform: scale(0.99); }

  .kb-doc-icon { font-size: 15px; margin-top: 1px; flex-shrink: 0; }
  .kb-doc-info { flex: 1; min-width: 0; }
  .kb-doc-name { font-size: 12.5px; font-weight: 600; color: var(--text); word-break: break-all; font-family: var(--mono); }
  .kb-doc-url { font-size: 11px; color: var(--accent); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kb-doc-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; font-size: 11px; color: var(--muted); margin-top: 5px; }
  .kb-doc-dot { opacity: 0.6; }
  .kb-doc-chevron { font-size: 16px; color: var(--muted); flex-shrink: 0; margin-top: 2px; }

  .kb-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 20px; margin-left: 2px; }
  .kb-pill-dot { width: 5px; height: 5px; border-radius: 50%; }
  .kb-pill--ok { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; }
  .kb-pill--ok .kb-pill-dot { background: var(--accent); }
  .kb-pill--err { color: var(--error-text); background: var(--error-bg); border: 1px solid #fecaca; }
  .kb-pill--err .kb-pill-dot { background: var(--error-text); }

  .kb-retry-btn { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 12px; cursor: pointer; }
  .kb-retry-btn:hover { border-color: var(--accent); color: var(--accent); }

  /* Chunk drawer — slides in over the list, never resizes it */
  .kb-drawer { position: absolute; inset: 0; background: var(--bg); border-radius: 10px; border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.08); display: flex; flex-direction: column; transform: translateX(110%); transition: transform 0.22s ease; pointer-events: none; }
  .kb-drawer--open { transform: translateX(0); pointer-events: auto; }

  .kb-drawer-header { flex-shrink: 0; display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
  .kb-drawer-back { width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
  .kb-drawer-back:hover { border-color: var(--accent); color: var(--accent); background: #f0fdf4; }
  .kb-drawer-title { min-width: 0; flex: 1; }
  .kb-drawer-filename { font-size: 12.5px; font-weight: 600; color: var(--text); font-family: var(--mono); word-break: break-all; }
  .kb-drawer-url { font-size: 11px; color: var(--accent); margin-top: 3px; word-break: break-all; }

  .kb-drawer-body { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
  .kb-chunk-loading, .kb-chunk-empty { padding: 32px 16px; font-size: 12.5px; color: var(--muted); text-align: center; }
  .kb-chunk-list { display: flex; flex-direction: column; }
  .kb-chunk { display: flex; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); align-items: flex-start; }
  .kb-chunk:last-child { border-bottom: none; }
  .kb-chunk-index { font-size: 10px; color: var(--muted); flex-shrink: 0; padding-top: 2px; min-width: 26px; font-family: var(--mono); font-weight: 600; }
  .kb-chunk-text { font-size: 12.5px; color: var(--text); line-height: 1.6; white-space: pre-wrap; }

  /* Skeleton loading state for the doc list */
  .kb-skeleton-list { display: flex; flex-direction: column; gap: 8px; }
  .kb-skeleton-card { display: flex; gap: 10px; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--border); }
  .kb-skeleton-icon { width: 16px; height: 16px; border-radius: 4px; background: var(--user-bg); animation: kbPulse 1.3s ease-in-out infinite; flex-shrink: 0; }
  .kb-skeleton-lines { flex: 1; display: flex; flex-direction: column; gap: 7px; padding-top: 2px; }
  .kb-skeleton-line { height: 9px; border-radius: 4px; background: var(--user-bg); animation: kbPulse 1.3s ease-in-out infinite; }
  .kb-skeleton-line--w70 { width: 70%; }
  .kb-skeleton-line--w40 { width: 40%; }
  @keyframes kbPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }

  /* Panel expand */
  .agent-panel--expanded { width: 100% !important; }
  .panel-expand-btn { margin-left: auto; font-size: 16px; padding: 6px 10px; }

  .kb-date-filter { display: flex; gap: 4px; flex-wrap: wrap; }
  .kb-date-btn { padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: var(--muted); font-size: 11px; cursor: pointer; font-family: var(--mono); transition: all 0.15s; }
  .kb-date-btn:hover { border-color: var(--accent); color: var(--accent); }
  .kb-date-btn--active { background: var(--accent); color: white; border-color: var(--accent); }
  .kb-filter-badge { color: var(--accent); font-weight: 500; }

  /* ── Stats Tab ──────────────────────────────────────────── */
  .stats-tab { display: flex; flex-direction: column; gap: 12px; }

  .stats-period-bar { display: flex; gap: 4px; flex-wrap: wrap; }
  .stats-period-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--muted); font-size: 12px; cursor: pointer; transition: all 0.15s; font-family: var(--font); }
  .stats-period-btn:hover { border-color: var(--accent); color: var(--accent); }
  .stats-period-btn--active { background: var(--accent); color: white; border-color: var(--accent); }

  .stats-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .stats-card { background: white; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
  .stats-card--cost { border-color: #bbf7d0; background: #f0fdf4; }
  .stats-card-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
  .stats-card-value { font-size: 18px; font-weight: 600; color: var(--text); font-family: var(--mono); }
  .stats-card--cost .stats-card-value { color: #15803d; }

  .stats-section { display: flex; flex-direction: column; gap: 6px; }
  .stats-section-title { font-size: 12px; font-weight: 600; color: var(--text); }

  .stats-table { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .stats-table-header { display: grid; grid-template-columns: 2fr 1fr 1.5fr 1.5fr; padding: 6px 10px; background: var(--user-bg); font-size: 11px; font-weight: 600; color: var(--muted); }
  .stats-table-row { display: grid; grid-template-columns: 2fr 1fr 1.5fr 1.5fr; padding: 7px 10px; font-size: 12px; color: var(--text); border-top: 1px solid var(--border); font-family: var(--mono); }
  .stats-table-row:hover { background: var(--user-bg); }

  /* ── Startup Briefing Banner ───────────────────────────────── */
  .briefing-banner { display: flex; gap: 12px; align-items: flex-start; background: #f0fdf4; border-bottom: 1px solid #bbf7d0; padding: 14px 20px; }
  .briefing-banner-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
  .briefing-banner-content { flex: 1; min-width: 0; }
  .briefing-banner-title { font-size: 13px; font-weight: 600; color: #15803d; margin-bottom: 4px; }
  .briefing-banner-text { font-size: 13px; color: var(--text); line-height: 1.6; white-space: pre-wrap; }
  .briefing-banner-close { background: none; border: none; cursor: pointer; color: #166534; font-size: 16px; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
  .briefing-banner-close:hover { background: #dcfce7; }
`;