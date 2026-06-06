# 📋 ĐẶC TẢ CHI TIẾT — WEB UI DASHBOARD (Control UI)
ui/ · Package: openclaw-control-ui · Framework: Lit + Vite

## MỤC LỤC
- Tổng quan và Stack
- Cấu trúc thư mục
- Entrypoint & Bootstrap
- Root Component: <openclaw-app>
- Kiến trúc tổng thể (Shell Layout)
- Navigation (Tab System)
- Gateway WebSocket Client
- State Management
- Settings & Persistence (LocalStorage)
- Theme System
- i18n System
- Controllers Layer
- Views: Từng Tab chi tiết
- Chat System
- Config Form System
- CSS Architecture
- Build System
- Testing
- Sơ đồ luồng chính
- API bắt buộc từ Gateway
- MVP Clone Roadmap
## 1. TỔNG QUAN
Control UI là Single Page Application phục vụ qua HTTP từ Gateway tại đường dẫn /web. Nó kết nối tới Gateway qua WebSocket và hoạt động như một terminal điều khiển toàn bộ hệ thống OpenClaw.

```text
Browser → ws://localhost:18789  (Gateway WebSocket)
        → http://localhost:18789/web  (SPA static files)
Stack:

| Công nghệ | Version | Vai trò |
|---|---|---|
| Lit | ^3.x | Web Components framework (LitElement) |
| Vite | ^5.x | Dev server + bundler |
| TypeScript | strict ESM | Ngôn ngữ |
| marked | — | Markdown rendering |
| dompurify | — | HTML sanitization |
| @noble/ed25519 | — | Device identity signing (Ed25519) |
| @create-markdown/preview | — | Markdown preview |
| Vitest | dev | Test runner |
| Playwright | dev | Browser tests |
ui/package.json

Không dùng React, Vue, Angular. Toàn bộ UI là Lit Web Components (LitElement) với reactive @state() decorators.

## 2. CẤU TRÚC THƯ MỤC
```text
ui/
├── index.html                    # SPA HTML entry; inline theme bootstrap script
├── package.json                  # name: openclaw-control-ui
├── vite.config.ts                # Vite config (base: ./, outDir: ../dist/control-ui)
├── vitest.config.ts              # Vitest browser tests
├── vitest.node.config.ts         # Vitest node tests
│
├── public/                       # Static assets
│   ├── favicon.svg
│   ├── favicon-32.png
│   └── apple-touch-icon.png
│
└── src/
    ├── main.ts                   # import styles + app.ts
    ├── styles.css                # Root styles import
    ├── css.d.ts                  # CSS module declarations
    ├── local-storage.ts          # Safe localStorage/sessionStorage wrappers
    │
    ├── styles/                   # CSS files
    │   ├── base.css              # CSS variables (themes), reset
    │   ├── layout.css            # Shell grid layout, topbar, sidebar
    │   ├── layout.mobile.css     # Mobile breakpoints
    │   ├── components.css        # Buttons, inputs, cards, badges, tables
    │   ├── chat.css              # Chat bubbles, message groups
    │   ├── config.css            # Config form, sections
    │   ├── usage.css             # Usage charts/tables
    │   ├── dreams.css            # Dreaming tab styles
    │   └── chat/                 # Chat-specific sub-styles
    │
    ├── i18n/                     # Internationalization
    │   ├── index.ts              # t(), i18n object, isSupportedLocale()
    │   ├── lib/                  # Type system for translations
    │   │   ├── types.ts          # TranslationMap type
    │   │   └── registry.ts       # Locale registry
    │   ├── locales/              # Translation files
    │   │   ├── en.ts             # English (source of truth)
    │   │   ├── de.ts, es.ts, fr.ts, ja-JP.ts
    │   │   ├── ko.ts, pl.ts, pt-BR.ts, tr.ts
    │   │   ├── uk.ts, zh-CN.ts, zh-TW.ts
    │   │   └── id.ts
    │   └── .i18n/               # Generated metadata (gitignored content)
    │
    └── ui/
        ├── app.ts                # Root LitElement: <openclaw-app>
        ├── app-render.ts         # renderApp() — main render function
        ├── app-render.helpers.ts # renderTab(), renderChatControls(), etc.
        ├── app-render-usage-tab.ts
        ├── app-gateway.ts        # connectGateway() — WS connection logic
        ├── app-lifecycle.ts      # handleConnected/Disconnected/FirstUpdated
        ├── app-settings.ts       # setTab(), setTheme(), loadOverview(), etc.
        ├── app-channels.ts       # handleWhatsAppStart/Logout, Nostr handlers
        ├── app-chat.ts           # handleSendChat(), handleAbortChat()
        ├── app-scroll.ts         # Chat/logs scroll management
        ├── app-tool-stream.ts    # Tool stream events, CompactionStatus
        ├── app-events.ts         # EventLogEntry type
        ├── app-view-state.ts     # AppViewState type
        ├── app-defaults.ts       # DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS
        ├── app-polling.ts        # Polling logic
        │
        ├── gateway.ts            # GatewayBrowserClient class (WS client)
        ├── navigation.ts         # TAB_GROUPS, Tab type, pathForTab(), tabFromPath()
        ├── storage.ts            # loadSettings(), saveSettings(), UiSettings type
        ├── theme.ts              # ThemeName, ThemeMode, resolveTheme()
        ├── theme-transition.ts   # CSS theme transition animation
        ├── icons.ts              # SVG icon registry
        ├── types.ts              # All shared types (re-exports from src/)
        ├── ui-types.ts           # UI-specific types (ChatAttachment, CronFormState)
        ├── types/                # Additional type modules
        │   └── chat-types.ts     # ChatItem, MessageGroup
        ├── markdown.ts           # renderMarkdown() with DOMPurify
        ├── format.ts             # formatRelativeTimestamp(), formatMs(), etc.
        ├── presenter.ts          # formatSessionTokens(), formatCronSchedule()
        ├── session-key.ts        # parseAgentSessionKey(), buildAgentMainSessionKey()
        ├── uuid.ts               # generateUUID()
        ├── text-direction.ts     # detectTextDirection() (RTL support)
        ├── focus-mode.browser.test.ts
        ├── external-link.ts      # buildExternalLinkRel(), EXTERNAL_LINK_TARGET
        ├── open-external-url.ts  # resolveSafeExternalUrl()
        ├── device-auth.ts        # storeDeviceAuthToken(), loadDeviceAuthToken()
        ├── device-identity.ts    # Ed25519 key pair management
        ├── connect-error.ts      # formatConnectError()
        ├── assistant-identity.ts # normalizeAssistantIdentity()
        ├── thinking.ts           # Thinking level display helpers
        ├── tool-display.ts       # Tool name/icon display
        │
        ├── components/           # Shared Web Components
        │   ├── dashboard-header.ts   # <dashboard-header> component
        │   └── resizable-divider.ts  # <resizable-divider> for chat split panel
        │
        ├── controllers/          # Data fetching layer (Gateway API calls)
        │   ├── chat.ts           # loadChatHistory(), handleChatEvent()
        │   ├── config.ts         # loadConfig(), saveConfig(), applyConfig()
        │   ├── config/           # Config form utilities
        │   │   ├── form-coerce.ts
        │   │   └── form-utils.ts
        │   ├── channels.ts       # loadChannels()
        │   ├── agents.ts         # loadAgents(), loadToolsCatalog()
        │   ├── sessions.ts       # loadSessions(), patchSession()
        │   ├── skills.ts         # loadSkills(), installSkill(), searchClawHub()
        │   ├── cron.ts           # loadCronJobs(), addCronJob(), runCronJob()
        │   ├── presence.ts       # loadPresence()
        │   ├── nodes.ts          # loadNodes()
        │   ├── devices.ts        # loadDevices(), approveDevicePairing()
        │   ├── dreaming.ts       # loadDreamingStatus(), updateDreamingEnabled()
        │   ├── exec-approval.ts  # parseExecApprovalRequested()
        │   ├── exec-approvals.ts # loadExecApprovals(), saveExecApprovals()
        │   ├── logs.ts           # loadLogs()
        │   ├── health.ts         # loadHealthState()
        │   ├── usage.ts          # loadUsage()
        │   ├── models.ts         # loadModelCatalog()
        │   ├── debug.ts          # loadDebug(), callDebugMethod()
        │   ├── assistant-identity.ts
        │   ├── agent-files.ts
        │   ├── agent-identity.ts
        │   ├── agent-skills.ts
        │   ├── scope-errors.ts
        │   └── control-ui-bootstrap.ts  # /__openclaw/control-ui-config.json
        │
        ├── chat/                 # Chat subsystem
        │   ├── grouped-render.ts        # renderMessageGroup()
        │   ├── message-normalizer.ts    # normalizeMessage()
        │   ├── slash-commands.ts        # SlashCommandDef, SLASH_COMMANDS
        │   ├── slash-command-executor.ts # Execute slash commands
        │   ├── tool-cards.ts            # Tool call/result card rendering
        │   ├── tool-helpers.ts          # Tool display helpers
        │   ├── attachment-support.ts    # CHAT_ATTACHMENT_ACCEPT
        │   ├── speech.ts                # STT (Web Speech API)
        │   ├── input-history.ts         # Up/Down arrow history
        │   ├── session-cache.ts         # Per-session UI cache
        │   ├── pinned-messages.ts       # Pinned messages
        │   ├── deleted-messages.ts      # Deleted messages
        │   ├── export.ts                # exportChatMarkdown()
        │   ├── search-match.ts          # messageMatchesSearchQuery()
        │   └── copy-as-markdown.ts
        │
        └── views/                # Tab view renderers (pure functions → TemplateResult)
            ├── chat.ts           # renderChat()
            ├── overview.ts       # renderOverview()
            ├── channels.ts       # renderChannels()
            ├── channels.*.ts     # Per-channel cards (whatsapp, telegram, discord, ...)
            ├── config.ts         # renderConfig()
            ├── config-form.ts    # renderConfigForm()
            ├── config-form.shared.ts
            ├── config-form.render.ts
            ├── config-form.analyze.ts
            ├── config-form.search.node.test.ts
            ├── config-form.node.ts
            ├── sessions.ts       # renderSessions()
            ├── skills.ts         # renderSkills()
            ├── cron.ts           # renderCron()
            ├── agents.ts         # renderAgents()
            ├── agents-panels-*.ts  # Agent sub-panels
            ├── agents-utils.ts
            ├── nodes.ts          # renderNodes()
            ├── instances.ts      # renderInstances()
            ├── usage.ts          # renderUsage()
            ├── dreaming.ts       # renderDreaming()
            ├── logs.ts           # renderLogs()
            ├── debug.ts          # renderDebug()
            ├── connect-command.ts
            ├── command-palette.ts
            ├── login-gate.ts
            ├── exec-approval.ts
            ├── gateway-url-confirmation.ts
            ├── markdown-sidebar.ts
            ├── overview-*.ts     # Overview sub-sections
            ├── navigation-groups.test.ts
            └── ...
ui/src/

## 3. ENTRYPOINT & BOOTSTRAP
### 3.1 HTML Bootstrap
File: ui/index.html

Trước khi JS tải, index.html có một inline script để apply theme ngay lập tức từ localStorage (tránh flash of unstyled content):

```javascript
// Đọc settings từ localStorage key: "openclaw.control.settings.v1"
// → set data-theme attribute trên <html>
// Themes: claw (default), knot, dash
// Modes: system, light, dark
// Resolved themes: "dark" | "light" | "openknot" | "openknot-light" | "dash" | "dash-light"
```
Custom element tag: <openclaw-app> — được define bởi src/ui/app.ts.

ui/index.html:11-63

### 3.2 Main Entry
File: ui/src/main.ts

```typescript
import "./styles.css";    // Import all CSS
import "./ui/app.ts";     // Register <openclaw-app> custom element
```
### 3.3 Control UI Config
Khi bootstrap, UI fetch / /__openclaw/control-ui-config.json để lấy:

```json
{
  "basePath": "/",
  "assistantName": "OpenClaw",
  "assistantAvatar": ""
}
```
ui/src/ui/controllers/control-ui-bootstrap.ts, ui/vite.config.ts:46-56

## 4. ROOT COMPONENT: <openclaw-app>
File: ui/src/ui/app.ts — Class OpenClawApp extends LitElement

Đây là component duy nhất — toàn bộ UI là một monolithic LitElement với ~150 @state() fields. Pattern này dùng Lit's reactive properties để re-render.

### 4.1 State Fields Quan Trọng
| Field | Type | Mô tả |
|---|---|---|
| tab | Tab | Tab hiện tại (routing) |
| connected | boolean | WS connected |
| hello | GatewayHelloOk | null | Server info sau connect |
| settings | UiSettings | LocalStorage settings |
| theme / themeMode | ThemeName / ThemeMode | Theme state |
| sessionKey | string | Chat session key |
| chatMessages | unknown[] | Chat history |
| chatStream | string | null | Streaming text |
| chatRunId | string | null | Current agent run ID |
| configForm | Record<string, unknown> | null | Config form values |
| channelsSnapshot | ChannelsStatusSnapshot | null | Channel status |
| agentsList | AgentsListResult | null | Agent list |
| onboarding | boolean | Onboarding mode |
| navDrawerOpen | boolean | Mobile nav drawer |
| sidebarOpen | boolean | Chat sidebar panel |
| client | GatewayBrowserClient | null | WS client instance |
### 4.2 Lifecycle
```text
constructor()
    → loadSettings() từ localStorage
    → i18n.setLocale() nếu có setting

connectedCallback() [firstUpdated()]
    → handleFirstUpdated()
        ├── loadOrCreateDeviceIdentity()
        ├── loadControlUiBootstrapConfig()
        ├── connectGateway()        ← kết nối WS
        ├── applySettings()         ← apply theme/nav
        └── popstate listener       ← URL routing

updated()
    → handleUpdated()             ← reload dữ liệu khi tab change

disconnectedCallback()
    → client.stop()
```
ui/src/ui/app.ts:124-350, ui/src/ui/app-lifecycle.ts

## 5. KIẾN TRÚC SHELL LAYOUT
File: ui/src/styles/layout.css

Layout là CSS Grid 2×2:

```text
┌─────────────────────────────────────────────────────┐
│  grid-cols: [nav-width] [1fr]                       │
│  grid-rows: [topbar-height=52px] [1fr]              │
│                                                     │
│  ┌──────────────┬────────────────────────────────┐  │
│  │              │  TOPBAR (topbar)               │  │
│  │              │  - Tab title + subtitle        │  │
│  │  SIDEBAR     │  - Breadcrumb / actions        │  │
│  │  (shell-nav) │  - Theme mode toggle           │  │
│  │              ├────────────────────────────────┤  │
│  │  - Logo      │  CONTENT AREA                  │  │
│  │  - Nav groups│  (scroll container)            │  │
│  │    + tabs    │  → renderTab(app, tab)         │  │
│  │              │                                │  │
│  │              │                                │  │
│  └──────────────┴────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```
CSS Variables quan trọng:

```css
--shell-nav-width: 258px;         /* Sidebar mở rộng */
--shell-nav-rail-width: 78px;     /* Sidebar thu gọn (icon only) */
--shell-topbar-height: 52px;
```
Modes:

.shell--nav-collapsed → nav = 78px (icon-only rail)
.shell--chat-focus → nav = 0px (focus mode)
.shell--onboarding → nav + topbar ẩn hoàn toàn
Mobile: drawer nav (hamburger button)
ui/src/styles/layout.css:1-100

## 6. NAVIGATION (TAB SYSTEM)
File: ui/src/ui/navigation.ts

### 6.1 Tab Groups
```typescript
TAB_GROUPS = [
  { label: "chat",     tabs: ["chat"] },
  { label: "control",  tabs: ["overview", "channels", "instances", "sessions", "usage", "cron"] },
  { label: "agent",    tabs: ["agents", "skills", "nodes", "dreams"] },
  { label: "settings", tabs: ["config", "communications", "appearance", "automation", "infrastructure", "aiAgents", "debug", "logs"] }
]
```
### 6.2 Tab → URL Path Mapping
| Tab | URL | Subtitle |
|---|---|---|
| chat | /chat (default /) | "Gateway chat for quick interventions" |
| overview | /overview | "Status, entry points, health" |
| channels | /channels | "Channels and settings" |
| instances | /instances | "Connected clients and nodes" |
| sessions | /sessions | "Active sessions and defaults" |
| usage | /usage | "API usage and costs" |
| cron | /cron | "Wakeups and recurring runs" |
| agents | /agents | "Workspaces, tools, identities" |
| skills | /skills | "Skills and API keys" |
| nodes | /nodes | "Paired devices and commands" |
| config | /config | "Edit openclaw.json" |
| communications | /communications | "Channels, messages, and audio" |
| appearance | /appearance | "Theme, UI, setup wizard" |
| automation | /automation | "Commands, hooks, cron, plugins" |
| infrastructure | /infrastructure | "Gateway, web, browser, media" |
| aiAgents | /ai-agents | "Agents, models, skills, tools, memory" |
| debug | /debug | "Snapshots, events, RPC" |
| logs | /logs | "Live gateway logs" |
| dreams | /dreaming | "Memory dreaming, consolidation" |
### 6.3 Routing
Dùng window.history.pushState + popstate event (client-side SPA routing, không dùng router library)
tabFromPath(pathname) → xác định tab từ URL
pathForTab(tab) → tạo URL
ui/src/ui/navigation.ts

## 7. GATEWAY WEBSOCKET CLIENT
File: ui/src/ui/gateway.ts — Class GatewayBrowserClient

### 7.1 Connection Flow
```text
GatewayBrowserClient.start()
    │
    └── connect()
            ├── new WebSocket(opts.url)
            ├── ws.onopen → queueConnect()
            │       └── setTimeout(750ms) → sendConnect()
            │               ├── buildConnectPlan()
            │               │   ├── loadOrCreateDeviceIdentity()  # Ed25519 key pair
            │               │   └── selectConnectAuth()           # token / device token
            │               └── request("connect", connectParams)
            │                       ├── minProtocol: 3, maxProtocol: 3
            │                       ├── role: "operator"
            │                       ├── scopes: ["operator.admin", "operator.read", ...]
            │                       ├── caps: ["tool-events"]
            │                       ├── device: { id, publicKey, signature, signedAt, nonce }
            │                       └── auth: { token?, deviceToken?, password? }
            │
            ├── ws.onmessage → handleMessage(raw)
            │       ├── frame.type === "event" → opts.onEvent(evt)
            │       │   special: "connect.challenge" → lấy nonce → sendConnect()
            │       └── frame.type === "res" → resolve/reject pending request
            │
            └── ws.onclose → scheduleReconnect()
                    (exponential backoff: 800ms → max 15s, factor 1.7)
```
### 7.2 Auth Strategy
Device Identity: Ed25519 key pair, lưu localStorage (IndexedDB nếu có crypto.subtle)
Token auth: explicit token trong settings
Device token: Sau khi connect thành công, server cấp deviceToken → lưu vào localStorage scoped theo role
Password auth: HTTP basic (fallback)
One-time retry: Nếu AUTH_TOKEN_MISMATCH → retry với stored device token (1 lần)
### 7.3 Request/Response Protocol
```typescript
// Request frame (client → server):
{ type: "req", id: "uuid-v4", method: "chat.send", params: {...} }

// Response frame (server → client):
{ type: "res", id: "uuid-v4", ok: true, payload: {...} }
{ type: "res", id: "uuid-v4", ok: false, error: { code, message, details } }

// Event frame (server → client):
{ type: "event", event: "agent.delta", payload: {...}, seq: 42 }
```
### 7.4 Sequence Gap Detection
Mỗi event có seq number — nếu received > lastSeq + 1 thì opts.onGap() được gọi (client có thể refresh).

### 7.5 Non-recoverable Auth Errors (không auto-reconnect)
```text
AUTH_TOKEN_MISSING, AUTH_BOOTSTRAP_TOKEN_INVALID,
AUTH_PASSWORD_MISSING, AUTH_PASSWORD_MISMATCH,
AUTH_RATE_LIMITED, PAIRING_REQUIRED,
CONTROL_UI_DEVICE_IDENTITY_REQUIRED, DEVICE_IDENTITY_REQUIRED
```
ui/src/ui/gateway.ts:275-622

## 8. STATE MANAGEMENT
Pattern: Monolithic LitElement với Lit reactive @state() properties. Khi @state() field thay đổi → Lit schedule re-render (microtask batch).

### 8.1 Event Flow
```text
Gateway Event (WS)
    │
    ├── app-gateway.ts: connectGateway()
    │       └── client = new GatewayBrowserClient({
    │               onHello: (hello) → handleConnected(app, hello)
    │               onEvent: (evt)  → handleGatewayEvent(app, evt)
    │               onClose: (info) → handleDisconnected(app, info)
    │           })
    │
    └── handleGatewayEvent(app, evt):
            ├── "tick"            → refresh active tab data
            ├── "agent.delta"     → app.chatStreamSegments.push(text)
            ├── "agent.done"      → reload chat history
            ├── "agent.tool_call" → app tool stream update
            ├── "sessions.updated"→ loadSessions()
            ├── "channels.updated"→ refresh channels snapshot
            ├── "exec.approval.requested" → add to approval queue
            ├── "update.available"→ app.updateAvailable = payload
            └── ...
```
### 8.2 Controllers Pattern
Mỗi controller là module cấp file export các async functions nhận state object (subset of OpenClawApp fields) và client (GatewayBrowserClient):

```typescript
// controllers/config.ts
export async function loadConfig(state: ConfigState) {
    if (!state.client || !state.connected) return;
    state.configLoading = true;
    try {
        const res = await state.client.request<ConfigSnapshot>("config.get", {});
        applyConfigSnapshot(state, res);
    } catch (err) {
        state.lastError = String(err);
    } finally {
        state.configLoading = false;
    }
}
```
Tất cả controllers đều:

Gọi state.client.request(method, params) → Promise
Update state trực tiếp (mutate)
Lit sẽ detect change qua @state() và re-render
ui/src/ui/controllers/

## 9. SETTINGS & PERSISTENCE
File: ui/src/ui/storage.ts

### 9.1 UiSettings
```typescript
type UiSettings = {
  gatewayUrl: string;           // WS URL (mặc định: ws://localhost:18789)
  token: string;                // Auth token (session storage only, không persist)
  sessionKey: string;           // Current chat session key
  lastActiveSessionKey: string;
  theme: ThemeName;             // "claw" | "knot" | "dash"
  themeMode: ThemeMode;         // "system" | "light" | "dark"
  chatFocusMode: boolean;       // Focus mode toggle
  chatShowThinking: boolean;    // Show thinking blocks
  chatShowToolCalls: boolean;   // Show tool call cards
  splitRatio: number;           // Chat sidebar split (0.4–0.7, default 0.6)
  navCollapsed: boolean;        // Sidebar collapse state
  navWidth: number;             // Sidebar width (200–400px, default 220)
  navGroupsCollapsed: Record<string, boolean>;  // Which nav groups collapsed
  borderRadius: number;         // Corner roundness (0–100, default 50)
  locale?: string;              // UI language
};
```
### 9.2 Storage Strategy
| Loại data | Storage | Key |
|---|---|---|
| Settings (theme, nav, etc.) | localStorage | openclaw.control.settings.v1:<gateway-url> |
| Auth token | sessionStorage | openclaw.control.token.v1:<gateway-url> |
| Device auth token | localStorage | openclaw.control.device-auth.v1:<deviceId>:<role> |
| Device identity (Ed25519) | localStorage hoặc IndexedDB | openclaw.device-identity.v1 |
Multi-gateway support: Settings scoped theo gatewayUrl. Có thể kết nối tới nhiều gateway khác nhau, mỗi cái có settings riêng (kể cả sessionKey).

ui/src/ui/storage.ts, ui/src/ui/device-auth.ts, ui/src/ui/device-identity.ts

## 10. THEME SYSTEM
File: ui/src/ui/theme.ts, ui/src/styles/base.css

### 10.1 Theme Names
| ThemeName | Mô tả | Resolved (dark) | Resolved (light) |
|---|---|---|---|
| claw | Default dark/light | "dark" | "light" |
| knot | OpenKnot dark | "openknot" | "openknot-light" |
| dash | Field Manual/Dash | "dash" | "dash-light" |
### 10.2 CSS Variable System
Theme apply qua data-theme attribute trên <html>:

```css
/* base.css */
:root { /* dark = claw dark */ --bg: #0e1015; --accent: #ff5c5c; --text: #d4d4d8; ... }
[data-theme="light"] { --bg: #f5f5f7; --accent: #e63936; ... }
[data-theme="openknot"] { --bg: #0a0d14; --accent: #4ade80; ... }
[data-theme="dash"] { --bg: #0d1117; --accent: #3b82f6; ... }
```
CSS Variables chính:

```text
--bg, --bg-accent, --bg-elevated, --bg-hover
--card, --card-foreground
--text, --text-strong, --muted
--border, --border-strong
--accent, --accent-hover, --accent-subtle, --accent-glow
--ok, --warn, --destructive, --danger
--primary, --secondary
```
### 10.3 Theme Transition Animation
File: ui/src/ui/theme-transition.ts

Dùng CSS clip-path: circle(...) animation với --theme-switch-x/y để expand từ điểm click.

### 10.4 BorderRadius CSS Variable
```css
--radius: calc(var(--app-border-radius, 50) * 0.08px);
/* 0 → 0px; 50 → 4px; 100 → 8px */
```
ui/src/ui/theme.ts, ui/src/styles/base.css

## 11. i18n SYSTEM
File: ui/src/i18n/

13 ngôn ngữ: English, German, Spanish, French, Indonesian, Japanese, Korean, Polish, Portuguese (Brazil), Turkish, Ukrainian, Simplified Chinese, Traditional Chinese.

```typescript
// Usage in views:
import { t } from "../../i18n/index.ts";
t("tabs.chat")        // → "Chat"
t("channels.health.title")  // → "Channel health"
t("common.save")      // → "Save"
i18n không dùng React i18n library — đây là hệ thống tự viết đơn giản với TypeScript type-safe translation map.
```

ui/src/i18n/locales/en.ts

## 12. CONTROLLERS LAYER
Pattern: Pure async functions → call Gateway WS API → mutate state object.

### 12.1 Chat Controller
File: ui/src/ui/controllers/chat.ts

```typescript
loadChatHistory(state)    → client.request("sessions.history", { key })
handleChatEvent(state, evt):
  "chat.message"          → append to chatMessages
  "chat.stream"           → update chatStream  
  "chat.done"             → finalize, clear stream
```
### 12.2 Config Controller
File: ui/src/ui/controllers/config.ts

```typescript
loadConfig(state)         → client.request("config.get", {})
saveConfig(state)         → client.request("config.set", { config })
applyConfig(state)        → client.request("config.apply", { sessionKey })
runUpdate(state)          → client.request("update.run", {})
loadConfigSchema(state)   → client.request("config.schema", {})
```
### 12.3 Sessions Controller
File: ui/src/ui/controllers/sessions.ts

```typescript
loadSessions(state)       → client.request("sessions.list", { activeMinutes, limit, ... })
patchSession(key, patch)  → client.request("sessions.patch", { key, ...patch })
deleteSessionsAndRefresh(keys) → client.request("sessions.delete", { keys })
subscribeSessions(state)  → client.request("sessions.messages.subscribe", { key })
```
### 12.4 Cron Controller
File: ui/src/ui/controllers/cron.ts

```typescript
loadCronJobs()            → client.request("cron.list", filters)
addCronJob(form)          → client.request("cron.create", params)
toggleCronJob(id)         → client.request("cron.patch", { id, enabled: !current })
runCronJob(id)            → client.request("cron.trigger", { id })
removeCronJob(id)         → client.request("cron.delete", { id })
loadCronRuns(jobId)       → client.request("cron.runs.list", { jobId })
```
13. VIEWS: TỪNG TAB
Mỗi view là pure render function: nhận props → trả về TemplateResult (Lit html``).

### 13.1 chat — /chat
File: ui/src/ui/views/chat.ts

Input textarea với slash command autocomplete (/model, /think, /new, ...)
Message bubbles: user / assistant / tool_call / tool_result groups
Streaming text indicator (live delta)
Thinking blocks (collapsible)
Tool call cards (expandable sidebar)
Resizable split panel (<resizable-divider>)
File/image attachment upload
STT (Speech-to-Text via Web Speech API)
Chat export (Markdown)
Session picker dropdown
Search trong messages
Pinned messages panel
Keyboard shortcut: Enter send, Shift+Enter newline, Up/Down history
Props quan trọng: sessionKey, messages, stream, chatToolMessages, assistantAvatarUrl

### 13.2 overview — /overview
File: ui/src/ui/views/overview.ts

Gateway Access panel: WS URL, token, password input, connect button
Status cards: sessions count, presence (connected clients), channels health, next cron
Attention items: lỗi cần xử lý, missing config, update available
Event log: real-time WS events
Log tail: last N lines của gateway log
### 13.3 channels — /channels
File: ui/src/ui/views/channels.ts + channels.*.ts

Grid 2-column layout, mỗi kênh là một card
Per-channel cards: WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Nostr, Google Chat
Mỗi card: status badge (configured/linked/running/connected), last message, error
WhatsApp: QR code login, logout, relink button
Telegram: bot info, webhook URL, probe button
Discord: invite link, guild count
Nostr: profile form (pubkey/relays/name), import from relays
Config section: per-channel config form
### 13.4 sessions — /sessions
File: ui/src/ui/views/sessions.ts

Table: session key, kind, last updated, token count
Sortable columns
Pagination
Filters: activeMinutes, limit, includeGlobal, includeUnknown
Search
Per-row actions: patch (thinking level, label), navigate to chat
Bulk delete selected
### 13.5 cron — /cron
File: ui/src/ui/views/cron.ts

Status badge (running/idle)
Job list với filter/sort (enabled, scheduleKind, lastStatus)
Job detail: schedule, channel, message, next run, last run
Add/edit/delete/clone job form
Run log per job
Quick run button
### 13.6 agents — /agents
File: ui/src/ui/views/agents.ts

Sub-panels:

Overview: Agent identity card (name, avatar, agentId), model info, session count
Files: File browser của agent workspace (~/.openclaw/agents/<id>/workspace/)
Xem/chỉnh sửa: AGENTS.md, BOOT.md, SKILLS.md, v.v.
Tools: Tools catalog (built-in + plugin tools)
Skills: Skills list (active/inactive, API key input)
Channels: Channel routing per agent
Cron: Cron jobs per agent
### 13.7 skills — /skills
File: ui/src/ui/views/skills.ts

Filter: all / ready / needs-setup / disabled
Per-skill card: name, description, status chips (active/inactive/missing-key)
API key input per skill
ClawHub integration: search + install skills từ registry
clawhubQuery → call claw.hub.search
Install button → skills.install({ slug })
### 13.8 nodes — /nodes
File: ui/src/ui/views/nodes.ts

Node list (connected gateway nodes / remote devices)
Devices: paired iOS/Android/desktop devices
Pending pairing: approve / reject
Active devices: revoke token, rotate token
Exec Approvals: per-agent exec allowlist/blocklist config
### 13.9 instances — /instances
File: ui/src/ui/views/instances.ts

Presence list: connected clients (WebChat, macOS, iOS, Android, CLI)
Per-client: platform, version, mode, last seen
### 13.10 usage — /usage
File: ui/src/ui/views/usage.ts

Token usage overview (input/output/total)
Cost estimates
Per-session breakdown
Per-model breakdown
Time range filter
### 13.11 config / communications / appearance / automation / infrastructure / aiAgents
File: ui/src/ui/views/config.ts

Cùng sử dụng renderConfigForm() — các sections khác nhau của openclaw.json được phân vào từng tab settings:

| Tab | Config sections |
|---|---|
| config | Full raw JSON editor + all sections |
| communications | channels, messages, audio |
| appearance | cli.appearance, wizard, gateway UI |
| automation | hooks, cron, plugins, commands |
| infrastructure | gateway, web, browser, media |
| aiAgents | agents, models, skills, tools, memory, session |
Config Form modes:

"form" → rendered form từ JSON Schema với sections/subsections
"raw" → Monaco-like textarea cho raw JSON edit
### 13.12 logs — /logs
File: ui/src/ui/views/logs.ts

Real-time gateway log stream
Level filter (debug/info/warn/error)
Search
Export logs
### 13.13 debug — /debug
File: ui/src/ui/views/debug.ts

Health snapshot JSON viewer
Event stream viewer
Manual RPC call form (method + params JSON)
### 13.14 dreams — /dreaming
File: ui/src/ui/views/dreaming.ts

Enable/disable memory dreaming
Dream diary viewer (Markdown)
Scene tab vs Diary tab
Next cycle countdown
ui/src/ui/views/

## 14. CHAT SYSTEM
File: ui/src/ui/chat/

### 14.1 Message Grouping
```text
chatMessages + chatToolMessages
    │
    └── message-normalizer.ts: normalizeMessage()
            → MessageGroup { role, items: ChatItem[] }
    │
    └── grouped-render.ts: renderMessageGroup()
            ├── renderUserGroup()
            ├── renderAssistantGroup()   ← với streaming indicator
            └── renderToolGroup()        ← tool call + result cards
```
### 14.2 Slash Commands
File: ui/src/ui/chat/slash-commands.ts

Khi gõ / trong input → autocomplete dropdown với SlashCommandDef:

```text
/new, /reset    → tạo session mới
/model <id>     → đổi model
/think <level>  → đặt thinking level
/compact        → trigger compaction
/stop           → abort agent run
/focus          → toggle focus mode
/export-session → export chat markdown
/usage          → xem token usage
/agents         → list agents
/kill           → kill session
/steer          → redirect agent
/tts <on/off>   → toggle TTS
/help           → show help
Local commands (xử lý client-side via RPC, không gửi đến agent):

help, new, reset, stop, compact, focus, model, think, fast, verbose, export-session, usage, agents, kill, steer
```
ui/src/ui/chat/slash-commands.ts:54-71

### 14.3 Tool Cards
File: ui/src/ui/chat/tool-cards.ts

```text
tool_call event:
    ├── Hiển thị collapsible card: tool name, args (JSON)
    ├── Icon theo tool type (bash=terminal, browser=globe, etc.)
    └── Expand → xem full args

tool_result event:
    ├── stdout/stderr (truncated)
    ├── Exit code badge
    └── Expand → xem full result trong sidebar
```
### 14.4 Input History
File: ui/src/ui/chat/input-history.ts

Up/Down arrows trong input → cycle through sent messages (in-memory, per-session)
### 14.5 Speech-to-Text
File: ui/src/ui/chat/speech.ts

Web Speech API (SpeechRecognition)
Microphone button trong input area
isSttSupported() → check browser support
### 14.6 Attachment Support
File: ui/src/ui/chat/attachment-support.ts

```text
CHAT_ATTACHMENT_ACCEPT = "image/*,video/*,audio/*,application/pdf,text/*,..."
Files attach → convert to base64 → gửi kèm params.attachments trong chat.send
```

## 15. CONFIG FORM SYSTEM
File: ui/src/ui/views/config-form.ts, config-form.shared.ts, config-form.render.ts

### 15.1 Schema-Driven Form
Config form tự động render từ JSON Schema của Gateway (config.schema method):

```text
config.schema → { schema: JSONSchema, uiHints: ConfigUiHints }
    │
    └── analyzeConfigSchema()   → sections + subsections
            └── renderConfigForm()
                    ├── renderSection() → renderField()
                    │   ├── text input
                    │   ├── checkbox (boolean)
                    │   ├── select (enum)
                    │   ├── number input
                    │   ├── object (nested form)
                    │   └── array (list with add/remove)
                    └── sensitive fields → placeholder "••••••••"
```
### 15.2 ConfigUiHints
```typescript
type ConfigUiHint = {
  label?: string;       // Override field label
  help?: string;        // Help text
  tags?: string[];      // Categorization
  advanced?: boolean;   // Hidden by default
  sensitive?: boolean;  // Redact value display
  placeholder?: string;
}
```
### 15.3 Section Meta
SECTION_META trong config-form.ts định nghĩa ordering và icon cho từng section.

### 15.4 Search trong Config Form
config-form.search.node.test.ts — có fuzzy search qua field labels/paths.

## 16. CSS ARCHITECTURE
File: ui/src/styles/

Không dùng Tailwind hay CSS-in-JS. Thuần CSS với CSS Variables.

```text
styles.css           ← import tất cả files sau
├── base.css         ← CSS variables (theme), animations, typography
├── layout.css       ← Shell grid, topbar, nav sidebar, content
├── layout.mobile.css← Responsive breakpoints (< 768px)
├── components.css   ← Button, input, card, badge, table, dialog, ...
├── chat.css         ← Message bubbles, input area, streaming
├── config.css       ← Config form, section nav
├── usage.css        ← Charts, usage tables
├── dreams.css       ← Dreaming tab specific
└── chat/            ← Additional chat sub-styles
```
Utility classes dùng theo Tailwind-style nhưng tự viết:

```css
.grid, .grid-cols-2, .flex, .items-center, .gap-4, .px-4, .py-2, ...
.text-sm, .text-muted, .font-mono, .truncate, ...
.badge, .badge--ok, .badge--warn, .badge--error, ...
.btn, .btn--primary, .btn--ghost, .btn--sm, .btn--icon, ...
.card, .card__header, .card__body, ...
CSS Custom Properties quan trọng:
```

```css
--accent: #ff5c5c        /* Signature red */
--bg: #0e1015            /* Dark background */
--text: #d4d4d8          /* Body text */
--border: #1e2028        /* Subtle borders */
--ok: #22c55e            /* Green status */
--warn: #f59e0b          /* Yellow warning */
--destructive: #ef4444   /* Red error */
```
## 17. BUILD SYSTEM
File: ui/vite.config.ts

```bash
# Dev server (port 5173, HMR)
pnpm ui:dev

# Production build → ../dist/control-ui/
pnpm ui:build
# OPENCLAW_CONTROL_UI_BASE_PATH=/web pnpm ui:build
```
Vite config:

base: "./" (relative paths, served từ subdirectory)
outDir: ../dist/control-ui
Sourcemaps enabled
chunkSizeWarningLimit: 1024 (UI bundle lớn)
Dev proxy: /__openclaw/control-ui-config.json → stub JSON
Gateway serve Control UI:

```text
src/gateway/server-http.ts:
  GET /web            → serve dist/control-ui/index.html
  GET /web/*          → serve dist/control-ui/<path>
  GET /web/chat, /web/overview, ... → serve index.html (SPA fallback)
```
## 18. TESTING
Files: ui/vitest.config.ts, ui/vitest.node.config.ts

```bash
# Browser tests (Playwright)
pnpm test                        # vitest.config.ts
# Node tests
pnpm test --config vitest.node.config.ts
```
Test patterns:

*.browser.test.ts — browser environment (Playwright)
*.node.test.ts — Node.js environment (jsdom)
*.test.ts — default (node/jsdom)
Các file test chính:

app-chat.test.ts — chat send/receive
app-gateway.*.node.test.ts — WS connection
app-lifecycle.node.test.ts — connect/disconnect
navigation.test.ts, navigation.browser.test.ts — routing
chat.browser.test.ts, chat.test.ts — message rendering
config.browser.test.ts — config form
storage.node.test.ts — settings persistence
theme.test.ts — theme resolution
## 19. SƠ ĐỒ LUỒNG
### 19.1 Sequence: Khởi động UI + Connect Gateway
```text
Browser mở ws://localhost:18789/web
    │
    ├─[1]─ Inline script: apply theme từ localStorage (tránh FOUC)
    ├─[2]─ main.ts: import styles.css + app.ts
    ├─[3]─ <openclaw-app> custom element mount
    │       ├─ loadSettings() → UiSettings từ localStorage
    │       └─ i18n.setLocale()
    │
    ├─[4]─ app-lifecycle.ts: handleFirstUpdated()
    │       ├─ fetch /__openclaw/control-ui-config.json → assistantName, basePath
    │       ├─ loadOrCreateDeviceIdentity() → Ed25519 key pair
    │       └─ connectGateway(app)
    │
    ├─[5]─ GatewayBrowserClient.start()
    │       ├─ new WebSocket("ws://localhost:18789")
    │       ├─ onopen → queueConnect() (delay 750ms)
    │       │
    │       └─ [Server sends: connect.challenge → nonce]
    │
    ├─[6]─ sendConnect()
    │       ├─ buildConnectPlan(): device identity + auth
    │       └─ request("connect", { minProtocol:3, maxProtocol:3, ... })
    │
    ├─[7]─ Server → hello-ok: { protocol, server, auth: { deviceToken } }
    │       ├─ storeDeviceAuthToken(deviceToken)
    │       └─ handleConnected(app, hello)
    │               ├─ app.connected = true
    │               ├─ app.hello = hello
    │               ├─ loadChatHistory()
    │               ├─ loadChannels()
    │               └─ loadOverview()
    │
    └─[8]─ UI renders shell với tab "chat" mặc định
```
### 19.2 Sequence: Gửi tin nhắn
```text
User gõ "hello" → Enter
    │
    ├─[1]─ app-chat.ts: handleSendChat(app)
    │       ├─ app.chatQueue.push({ id, message, ts })
    │       └─ client.request("chat.send", { key: sessionKey, message })
    │
    ├─[2]─ [Server nhận, chạy agent]
    │
    ├─[3]─ WS events streaming:
    │       ├─ { event: "agent.tool_call", payload: {name, args} }
    │       │       → app-tool-stream.ts: handleAgentEvent()
    │       │         → app.chatToolMessages.push(toolMsg)
    │       │
    │       ├─ { event: "agent.delta", payload: {text, runId} }
    │       │       → app.chatStream += text
    │       │       → app.chatStreamSegments.push({text, ts})
    │       │
    │       └─ { event: "agent.done", payload: {runId, usage} }
    │               → clear stream
    │               → loadChatHistory() để lấy final message
    │
    └─[4]─ UI re-render với bubble mới
```
### 19.3 Sequence: Config Edit + Apply
```text
User mở tab "config"
    │
    ├─[1]─ loadConfig() → client.request("config.get")
    │       → app.configForm = parsed JSON
    │
    ├─[2]─ loadConfigSchema() → client.request("config.schema")
    │       → app.configSchema = JSON Schema
    │
    ├─[3]─ renderConfigForm(schema, form) → sections + fields
    │
    ├─[4]─ User edit field: onFormPatch([path], value)
    │       → updateConfigFormValue(state, path, value)
    │       → app.configFormDirty = true
    │
    ├─[5]─ Click "Save": saveConfig()
    │       → client.request("config.set", { config })
    │
    └─[6]─ Click "Apply": applyConfig()
            → client.request("config.apply", { sessionKey })
```
## 20. GATEWAY API BẮT BUỘC
Để clone Control UI, cần implement các Gateway WS methods sau:

Phase 1 — Core (bắt buộc)
| Method | Params | Response |
|---|---|---|
| connect | GatewayConnectParams | GatewayHelloOk |
| health | {} | HealthSummary |
| chat.send | { key, message, attachments?, thinking?, timeoutMs? } | { runId } |
| chat.abort | { runId } | {} |
| sessions.history | { key, limit? } | { messages, toolMessages } |
| sessions.list | { limit?, activeMinutes?, ... } | SessionsListResult |
| config.get | {} | ConfigSnapshot |
| config.set | { config } | {} |
| config.apply | { sessionKey? } | {} |
| config.schema | {} | { schema, version, uiHints } |
Phase 2 — Dashboard
| Method | Response |
|---|---|
| channels.status | ChannelsStatusSnapshot |
| agents.list | AgentsListResult |
| sessions.patch | SessionsPatchResult |
| models.catalog | ModelCatalogEntry[] |
| presence.list | PresenceEntry[] |
| logs.stream | streamed log lines |
| skills.status | SkillStatusReport |
| cron.list | CronJob[] |
| cron.create | CronJob |
| cron.delete | {} |
| update.check | UpdateAvailable | null |
| update.run | {} |
Phase 3 — Advanced
| Method | Mô tả |
|---|---|
| nodes.list | Connected nodes |
| devices.list | Paired devices |
| devices.approve, .reject, .revoke | Device management |
| exec-approvals.get, .set | Exec policy |
| usage.query | Token usage |
| cron.runs.list | Run history |
| agents.files.list, .read, .write | Workspace files |
| skills.install, .enable, .disable | Skill management |
| dreaming.status, .set | Memory dreaming |
| dreaming.diary | Dream diary |
| debug.snapshot | Debug info |
WS Events (server → client)
| Event | Trigger |
|---|---|
| tick | Periodic (1-30s) — refresh signal |
| agent.delta | LLM streaming token |
| agent.tool_call | Tool being called |
| agent.tool_result | Tool result received |
| agent.done | Agent run completed |
| sessions.updated | Session state changed |
| channels.updated | Channel status changed |
| exec.approval.requested | Exec approval needed |
| exec.approval.resolved | Approval resolved |
| update.available | New version available |
| connect.challenge | Auth nonce for device signing |
## 21. MVP CLONE ROADMAP
### Bước 1 — Minimal Shell (1 tuần)
 index.html với theme bootstrap script
 main.ts entry
 LitElement setup (app.ts + @state() basics)
 GatewayBrowserClient (WebSocket client, request/response, events)
 CSS Variables system (base.css — dark/light themes)
 Shell layout CSS (nav + topbar + content grid)
 Navigation tabs + URL routing (pushState)
 loadSettings() / saveSettings() với localStorage
 Device identity (Ed25519 key pair)
 "Overview" tab: connect form (URL + token), connect button
Kết quả: Có thể kết nối tới Gateway, thấy "connected" status.

### Bước 2 — Chat (1 tuần)
 renderChat() view
 Message bubbles (user / assistant)
 Input textarea + send button
 chat.send + chat.history API calls
 agent.delta streaming
 Session selector
Kết quả: Chat hoạt động cơ bản.

### Bước 3 — Dashboard (2 tuần)
 Overview tab với cards (sessions, channels, cron)
 Channels tab: status cards per channel
 Sessions tab: table với filter/sort
 Tool call cards trong chat
 Slash command autocomplete
### Bước 4 — Config + Settings (1 tuần)
 Config tab: raw JSON textarea editor
 Load/Save/Apply config
 Config form renderer từ JSON Schema
 Theme picker (claw/knot/dash, light/dark)
### Bước 5 — Advanced (ongoing)
 i18n (13 languages)
 Cron tab: create/edit/delete jobs
 Agents tab: file browser + tools
 Skills tab: install/manage + ClawHub search
 Nodes + Devices + Exec Approvals
 Usage charts
 Logs streaming
 Debug tab
 Dreaming tab
 Focus mode
 Mobile responsive
 Attachment upload
Files cần implement trước tiên
```text
ui/index.html
ui/src/main.ts
ui/src/styles/base.css        ← CSS variables
ui/src/styles/layout.css      ← Shell grid
ui/src/styles/components.css  ← UI components
ui/src/ui/gateway.ts          ← WebSocket client
ui/src/ui/navigation.ts       ← Tab routing
ui/src/ui/storage.ts          ← Settings persistence
ui/src/ui/theme.ts            ← Theme system
ui/src/ui/app.ts              ← Root LitElement
ui/src/ui/app-render.ts       ← renderApp()
ui/src/ui/controllers/chat.ts
ui/src/ui/controllers/config.ts
ui/src/ui/views/chat.ts
ui/src/ui/views/overview.ts
ui/vite.config.ts
