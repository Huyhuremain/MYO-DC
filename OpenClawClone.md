# 📋 ĐẶC TẢ KỸ THUẬT CHI TIẾT — OPENCLAW
Phiên bản phân tích: 2026.4.6 · Repo: TieuLong07/openclaw

## MỤC LỤC
Tổng quan dự án
Stack công nghệ & Dependency
Cấu trúc thư mục
Entrypoint & Quá trình khởi động
Kiến trúc Gateway (control plane)
Giao thức WebSocket
Hệ thống Plugin & Extension
Agent (Pi) Runtime — Vòng lặp xử lý
Luồng tin nhắn (Message Flow)
Hệ thống Kênh (Channels)
Routing & Session
Config & State Management
Media Pipeline
TTS / Voice
Hooks / Automation
Pairing & Bảo mật
Companion Apps (macOS/iOS/Android)
UI Web (Control UI)
Testing & CI
Build System
Sơ đồ luồng chính (Text diagrams)
API quan trọng — Class/Function then chốt
MVP Clone Roadmap
## 1. TỔNG QUAN
OpenClaw là một Personal AI Gateway chạy local-first, kết nối các kênh nhắn tin (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, v.v.) với các model AI (Anthropic Claude, OpenAI GPT, Google Gemini, v.v.).

```text
Người dùng nhắn tin qua WhatsApp / Telegram / Discord / ...
                      │
                      ▼
          ┌──────────────────────────────┐
          │         Gateway              │
          │  ws://127.0.0.1:18789        │
          │  (control plane, WS/HTTP)    │
          └──────────┬───────────────────┘
                     │
          ┌──────────┼──────────────────────────────┐
          ▼          ▼          ▼          ▼         ▼
       Pi Agent    CLI      WebChat    macOS App   iOS/Android
      (RPC mode)            UI        (menubar)    (node mode)
```
Tính năng chính:

Multi-channel inbox (20+ kênh nhắn tin)
Multi-agent routing (mỗi kênh/account → agent riêng)
Voice Wake + Talk Mode (macOS/iOS/Android)
Live Canvas (A2UI) — workspace trực quan do agent điều khiển
Plugin/Extension API (npm-based)
Browser control (Chrome CDP)
Cron/webhook/automation
README.md:21-22, VISION.md:3-5

## 2. STACK VÀ DEPENDENCY
| Hạng mục | Công nghệ |
|---|---|
| Ngôn ngữ core | TypeScript (ESM strict) |
| Runtime | Node.js 22+ (Node 24 recommended) |
| Dev runner | Bun (optional, cho TypeScript trực tiếp) |
| Package manager | pnpm (workspace monorepo) |
| Build | tsdown → dist/ |
| Test | Vitest (V8 coverage) |
| Lint | Oxlint |
| Format | Oxfmt |
| Schema/validation | @sinclair/typebox (protocol), Zod (config) |
| CLI | Commander |
| AI agent core | @mariozechner/pi-coding-agent, @mariozechner/pi-agent-core |
| Gateway WS | Node ws (built-in via HTTP server) |
| macOS/iOS app | Swift + SwiftUI (apps/macos, apps/ios) |
| Android app | Kotlin + Gradle (apps/android) |
| Docs | Mintlify |
Dependency chính (package.json:main = dist/index.js, version 2026.4.6):

@mariozechner/pi-coding-agent — Pi agent: session manager, tool loop
@sinclair/typebox — runtime schema cho WS protocol
zod — config validation
commander — CLI framework
JSON5 — config file parsing
baileys (trong extension whatsapp) — WhatsApp Web protocol
grammy (trong extension telegram) — Telegram Bot API
discord.js (trong extension discord) — Discord API
@slack/bolt (trong extension slack) — Slack Bolt framework
sharp — image resizing/conversion
ffmpeg-static — audio/video processing
ws — WebSocket server
package.json, pnpm-workspace.yaml

## 3. CẤU TRÚC THƯ MỤC
```text
openclaw/
├── src/                          # Core TypeScript source
│   ├── entry.ts                  # ← CLI entrypoint chính
│   ├── index.ts                  # Library exports
│   ├── runtime.ts                # RuntimeEnv abstraction (log/error/exit)
│   ├── version.ts                # VERSION constant
│   │
│   ├── cli/                      # CLI surface (commander-based)
│   │   ├── run-main.ts           # runCli() — main CLI dispatcher
│   │   ├── route.ts              # tryRouteCli() — fast route dispatch
│   │   ├── program/              # Commander program setup
│   │   ├── gateway-cli/          # `openclaw gateway` subcommands
│   │   ├── daemon-cli/           # `openclaw daemon` subcommands
│   │   ├── nodes-cli/            # `openclaw nodes` subcommands
│   │   └── ...                   # ~100 CLI modules
│   │
│   ├── gateway/                  # Gateway WebSocket server
│   │   ├── server.ts             # Public export: startGatewayServer
│   │   ├── server.impl.ts        # startGatewayServer() implementation
│   │   ├── server-startup.ts     # startGatewaySidecars()
│   │   ├── server-methods.ts     # coreGatewayHandlers (all WS methods)
│   │   ├── server-methods/       # Per-domain WS handlers
│   │   │   ├── chat.ts           # chat.send, chat.abort
│   │   │   ├── sessions.ts       # sessions.*
│   │   │   ├── channels.ts       # channels.*
│   │   │   ├── config.ts         # config.apply, config.patch
│   │   │   ├── nodes.ts          # node.invoke, node.list
│   │   │   ├── cron.ts           # cron.*
│   │   │   └── ...
│   │   ├── protocol/             # TypeBox protocol schema
│   │   │   ├── schema.ts         # Re-exports all schemas
│   │   │   └── schema/           # Per-domain schemas
│   │   │       ├── frames.ts     # ConnectParams, HelloOk, TickEvent...
│   │   │       ├── sessions.ts   # SessionsList, SessionsSend...
│   │   │       ├── channels.ts
│   │   │       └── ...
│   │   ├── boot.ts               # BOOT.md startup task runner
│   │   ├── auth.ts               # Gateway auth resolution
│   │   └── ...                   # ~200 files
│   │
│   ├── agents/                   # Pi agent runtime
│   │   ├── agent-command.ts      # agentCommand() — top-level agent run
│   │   ├── agent-scope.ts        # Multi-agent ID resolution
│   │   ├── defaults.ts           # DEFAULT_MODEL, DEFAULT_PROVIDER
│   │   ├── model-selection.ts    # resolveConfiguredModelRef()
│   │   ├── model-fallback.ts     # runWithModelFallback()
│   │   ├── auth-profiles.ts      # Auth profile rotation
│   │   ├── pi-embedded-runner/   # Pi agent session execution
│   │   │   ├── run.ts            # runEmbedded() — main agent loop
│   │   │   ├── run/attempt.ts    # runEmbeddedAttempt() — single attempt
│   │   │   ├── model.ts          # resolveModelAsync()
│   │   │   ├── compact.ts        # Context compaction
│   │   │   └── ...
│   │   ├── bash-tools.*.ts       # exec tool (bash execution)
│   │   ├── skills-runtime.ts     # Skill resolution
│   │   └── ...
│   │
│   ├── channels/                 # Channel plugin framework
│   │   ├── plugins/              # Plugin contracts + runtime
│   │   │   ├── types.plugin.ts   # ChannelPlugin interface
│   │   │   ├── types.core.ts     # ChannelMessagingAdapter, etc.
│   │   │   ├── types.adapters.ts # ChannelLifecycleAdapter, etc.
│   │   │   ├── registry.ts       # Channel registry
│   │   │   └── ...
│   │   ├── run-state-machine.ts  # Channel state machine
│   │   └── ...
│   │
│   ├── plugins/                  # Plugin loader, registry, manifest
│   │   ├── loader.ts             # loadOpenClawPlugins()
│   │   ├── manifest.ts           # PluginManifest types + parsing
│   │   ├── registry.ts           # Plugin registry
│   │   ├── runtime/              # Plugin runtime execution
│   │   ├── types.ts              # Plugin types (Provider, Channel, etc.)
│   │   └── ...
│   │
│   ├── plugin-sdk/               # Public SDK for plugin authors
│   │   ├── core.ts               # Re-exports core plugin API
│   │   ├── plugin-entry.ts       # Plugin entry types
│   │   ├── provider-entry.ts     # Provider plugin entry
│   │   ├── channel-contract.ts   # Channel plugin contract
│   │   └── ...
│   │
│   ├── config/                   # Config loading, schema, validation
│   │   ├── config.ts             # loadConfig(), writeConfigFile()
│   │   ├── io.ts                 # Config I/O (read/write/snapshot)
│   │   ├── schema.ts             # Zod config schema
│   │   ├── paths.ts              # resolveStateDir(), config paths
│   │   ├── types.ts              # OpenClawConfig type
│   │   ├── types.openclaw.ts     # Root config type
│   │   ├── types.gateway.ts      # GatewayConfig
│   │   ├── types.channels.ts     # ChannelsConfig
│   │   ├── sessions/             # Session store management
│   │   └── ...
│   │
│   ├── routing/                  # Message routing, session key
│   │   ├── resolve-route.ts      # resolveRoute()
│   │   ├── session-key.ts        # Session key generation
│   │   └── ...
│   │
│   ├── auto-reply/               # Inbound dispatch + reply pipeline
│   │   ├── dispatch.ts           # dispatchInboundMessage()
│   │   ├── reply/                # Reply dispatcher, chunking
│   │   ├── thinking.ts           # ThinkLevel normalization
│   │   └── ...
│   │
│   ├── sessions/                 # Session lifecycle
│   │   ├── session-lifecycle-events.ts
│   │   ├── transcript-events.ts
│   │   └── ...
│   │
│   ├── media/                    # Media pipeline
│   │   ├── store.ts              # saveMediaBuffer()
│   │   ├── image-ops.ts          # Image resize/convert
│   │   ├── audio.ts              # Audio processing
│   │   ├── ffmpeg-exec.ts        # FFmpeg wrapper
│   │   └── ...
│   │
│   ├── hooks/                    # Hooks system (Gmail, internal)
│   │   ├── internal-hooks.ts     # triggerInternalHook()
│   │   ├── loader.ts             # loadInternalHooks()
│   │   └── ...
│   │
│   ├── tts/                      # Text-to-speech
│   │   ├── tts.ts                # TTS dispatch
│   │   ├── provider-registry.ts  # TTS provider registry
│   │   └── ...
│   │
│   ├── pairing/                  # Device pairing
│   ├── process/                  # Process management, command queue
│   ├── infra/                    # Infrastructure utilities
│   ├── terminal/                 # Terminal output (table, theme, progress)
│   └── ...
│
├── extensions/                   # Bundled plugin packages
│   ├── anthropic/                # Anthropic Claude provider
│   ├── openai/                   # OpenAI GPT provider
│   ├── telegram/                 # Telegram channel
│   ├── discord/                  # Discord channel
│   ├── whatsapp/                 # WhatsApp (Baileys)
│   ├── slack/                    # Slack (Bolt)
│   ├── signal/                   # Signal (signal-cli bridge)
│   ├── matrix/                   # Matrix
│   ├── google/                   # Google (Gemini)
│   ├── elevenlabs/               # ElevenLabs TTS
│   ├── memory-core/              # Memory plugin
│   ├── browser/                  # Browser CDP control
│   ├── voice-call/               # Voice call
│   └── ...                       # ~80 extensions
│
├── packages/                     # Internal packages
│   ├── plugin-package-contract/  # Plugin contract types
│   ├── memory-host-sdk/          # Memory host SDK
│   ├── clawdbot/                 # Legacy compat
│   └── moltbot/                  # Legacy compat
│
├── apps/
│   ├── macos/                    # macOS menu bar app (Swift/SwiftUI)
│   ├── ios/                      # iOS node app (Swift)
│   ├── android/                  # Android node app (Kotlin)
│   └── shared/                   # Shared Swift kit (OpenClawKit)
│
├── ui/                           # Control UI (web, Vite/React)
├── docs/                         # Documentation (Mintlify)
├── scripts/                      # Build/codegen/CI scripts
├── test/, test-fixtures/         # Test helpers
├── qa/                           # QA scenarios
├── Swabble/                      # Swift utility package
│
├── package.json                  # Root package (name: openclaw)
├── pnpm-workspace.yaml           # Workspace: ., ui, packages/*, extensions/*
├── tsconfig.json                 # TypeScript config
├── tsdown.config.ts              # Build config
└── vitest.config.ts              # Test config (root)
src/, extensions/, apps/, pnpm-workspace.yaml

```
## 4. ENTRYPOINT & KHỞI ĐỘNG
### 4.1 CLI Entrypoint
File: src/entry.ts

```text
node dist/entry.js  (hoặc openclaw.mjs → entry.js)
    │
    ├── enableCompileCache()          # Node compile cache
    ├── installGaxiosFetchCompat()    # Fetch compat layer
    ├── normalizeEnv()                # Env normalization
    ├── normalizeWindowsArgv()        # Windows argv fix
    ├── ensureCliRespawnReady()       # Profile respawn nếu cần
    ├── parseCliContainerArgs()       # --container target
    ├── parseCliProfileArgs()         # --profile / --dev
    ├── tryHandleRootVersionFastPath()# `openclaw --version` fast exit
    └── runMainOrRootHelp()
            └── import("./cli/run-main.js").runCli(argv)
```
src/entry.ts:44-156

### 4.2 CLI Dispatcher
File: src/cli/run-main.ts

```text
runCli(argv)
    │
    ├── assertSupportedRuntime()          # Node >= 22
    ├── tryRouteCli(argv)                 # Fast route (no plugin load)
    │       └── findRoutedCommand(path)   # src/cli/program/routes.ts
    │           └── route.run(argv)       # Direct execution
    │
    └── (fallback) Commander program
            ├── ensureConfigReady()       # Config guard / doctor check
            ├── ensurePluginRegistryLoaded()
            └── program.parseAsync(argv)
src/cli/run-main.ts, src/cli/route.ts

```
### 4.3 Gateway Startup
File: src/gateway/server.impl.ts:411

Gọi từ openclaw gateway run (hoặc openclaw onboard --install-daemon):

```text
startGatewayServer(port=18789, opts)
    │
    ├── readConfigFileSnapshot()              # Load openclaw.json
    ├── applyPluginAutoEnable()               # Auto-enable plugins
    ├── prepareSecretsRuntimeSnapshot()       # Resolve secrets/env
    ├── prepareGatewayStartupConfig()         # Auth bootstrap
    ├── loadGatewayStartupPlugins()           # Load extensions/
    ├── loadGatewayModelCatalog()             # Build model catalog
    ├── startGatewaySidecars()                # Start sidecars:
    │       ├── loadInternalHooks()           #   hooks
    │       ├── startPluginServices()         #   plugin services
    │       ├── startChannels()               #   channels (WA/TG/...)
    │       ├── startGmailWatcherWithLogs()   #   Gmail pub/sub
    │       └── prewarmConfiguredPrimaryModel()
    │
    ├── createGatewayRuntimeState()           # In-memory state
    ├── startGatewayDiscovery()               # mDNS/Bonjour
    ├── startGatewayTailscaleExposure()       # Tailscale serve/funnel
    ├── startGatewayConfigReloader()          # Config hot-reload watcher
    ├── startGatewayMaintenanceTimers()       # Cleanup timers
    ├── attachGatewayWsHandlers()             # WebSocket handler
    ├── createHttpServer() + listen(port)     # HTTP server (WS upgrade)
    ├── logGatewayStartup()                   # Print startup log
    └── return { server, close }
```
src/gateway/server.impl.ts:411-700, src/gateway/server-startup.ts

## 5. KIẾN TRÚC GATEWAY
```text
┌─────────────────────────────────────────────────────────────────┐
│                    OPENCLAW GATEWAY                             │
│                                                                 │
│  HTTP+WS Server (port 18789)                                    │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  server-http.ts       HTTP routes:                     │     │
│  │  - /health            GET health JSON                  │     │
│  │  - /web               Control UI (SPA)                 │     │
│  │  - /canvas            Canvas host                      │     │
│  │  - /v1/...            OpenAI-compatible API            │     │
│  │  - /mcp/...           MCP loopback server              │     │
│  │  - /api/webhooks/...  Webhook ingress                  │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  WS Handler (server-ws-runtime.ts)                              │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  connect → validate auth → assign connId               │     │
│  │  receive JSON message → route to handler               │     │
│  │  coreGatewayHandlers (server-methods.ts):              │     │
│  │    chat.*, sessions.*, channels.*, config.*            │     │
│  │    nodes.*, cron.*, health, models.*, tools.*          │     │
│  │    agent.*, send.*, skills.*, talk.*, tts.*            │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  Subsystems:                                                    │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  Channel Manager  │  │  Plugin Registry  │                   │
│  │  (server-channels)│  │  (runtime.ts)     │                   │
│  └──────────────────┘  └──────────────────┘                    │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  Cron Scheduler   │  │  Node Registry   │                   │
│  │  (server-cron.ts) │  │  (node-registry) │                   │
│  └──────────────────┘  └──────────────────┘                    │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  Secrets Runtime  │  │  Auth Rate Limiter│                   │
│  │  (secrets/runtime)│  │  (auth-rate-limit)│                   │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
src/gateway/server.impl.ts, src/gateway/server-methods.ts, src/gateway/server-http.ts

```
## 6. GIAO THỨC WEBSOCKET
File: src/gateway/protocol/schema/frames.ts

Protocol là JSON-RPC-like qua WebSocket. Khi kết nối:

```text
Client → Server: { type: "connect", ...ConnectParams }
Server → Client: { type: "hello-ok", protocol: N, server: { version, connId } }
                 hoặc { type: "hello-error", code, message }

```
Server → Client (broadcast/event):
  { type: "tick", ts: N }
  { type: "shutdown", reason, restartExpectedMs }
  { type: "snapshot", ... }   # State snapshot

Mỗi request:
  Client → Server: { id: "req-123", method: "chat.send", params: {...} }
  Server → Client: { id: "req-123", result: {...} }
                 hoặc { id: "req-123", error: { code, message } }

Stream events (agent đang chạy):
  Server → Client: { type: "agent.delta", runId, text }
  Server → Client: { type: "agent.tool_call", runId, name, args }
  Server → Client: { type: "agent.done", runId, usage }
Các methods WS:

| Domain | Methods |
|---|---|
| chat | chat.send, chat.abort, chat.history, chat.inject |
| sessions | sessions.list, sessions.create, sessions.send, sessions.resolve, sessions.preview, sessions.kill |
| channels | channels.list, channels.status, channels.probe |
| config | config.apply, config.patch, config.get |
| nodes | node.list, node.describe, node.invoke, node.subscribe |
| models | models.list, models.catalog |
| cron | cron.list, cron.create, cron.delete, cron.trigger |
| health | health |
| skills | skills.list, skills.install, skills.status |
| talk | talk.start, talk.stop, talk.config |
| tts | tts.speak |
| tools | tools.catalog, tools.effective |
| agent | agent.run, agent.stream |
| send | send.message |
| update | update.check, update.run |
| wizard | wizard.start, wizard.step |
ConnectParams schema (src/gateway/protocol/schema/frames.ts:20-69):

```typescript
{
  minProtocol: int, maxProtocol: int,
  client: { id, displayName?, version, platform, mode, ... },
  caps?: string[],       // Capabilities
  commands?: string[],   // Supported node commands
  permissions?: Record<string, boolean>,
  auth?: { token?, bootstrapToken?, deviceToken?, password? }
}
src/gateway/protocol/schema/frames.ts, src/gateway/protocol/schema/sessions.ts, src/gateway/server-methods-list.ts

```
## 7. PLUGIN & EXTENSION
### 7.1 Plugin Manifest
File: src/plugins/manifest.ts, manifest file: extensions/<id>/openclaw.plugin.json

```json
{
  "id": "anthropic",
  "enabledByDefault": true,
  "providers": ["anthropic"],
  "modelSupport": { "modelPrefixes": ["claude-"] },
  "providerAuthEnvVars": { "anthropic": ["ANTHROPIC_API_KEY"] },
  "providerAuthChoices": [...],
  "contracts": { "mediaUnderstandingProviders": ["anthropic"] },
  "configSchema": { "type": "object", "properties": {} }
}
extensions/anthropic/openclaw.plugin.json, extensions/openai/openclaw.plugin.json

```
### 7.2 Loại Plugin
| Loại | Interface | File |
|---|---|---|
| Provider (AI model) | OpenClawPluginDefinition | src/plugins/types.ts |
| Channel | ChannelPlugin | src/channels/plugins/types.plugin.ts |
| Memory | MemoryPlugin | plugin type |
| TTS/Speech | SpeechProviderPlugin | src/plugin-sdk/plugin-entry.ts |
| Image generation | ImageGenerationPlugin | extensions/ |
| Media understanding | MediaUnderstandingProviderPlugin | extensions/ |
| Hooks | export hooks | src/hooks/plugin-hooks.ts |
### 7.3 Channel Plugin Interface
File: src/channels/plugins/types.plugin.ts

```typescript
type ChannelPlugin = {
  meta: ChannelMeta;
  // Adapters (optional):
  lifecycle?: ChannelLifecycleAdapter;
  messaging?: ChannelMessagingAdapter;
  outbound?: ChannelOutboundAdapter;
  streaming?: ChannelStreamingAdapter;
  pairing?: ChannelPairingAdapter;
  auth?: ChannelAuthAdapter;
  setup?: ChannelSetupAdapter;
  security?: ChannelSecurityAdapter;
  config?: ChannelConfigAdapter;
  status?: ChannelStatusAdapter;
  group?: ChannelGroupAdapter;
  threading?: ChannelThreadingAdapter;
  heartbeat?: ChannelHeartbeatAdapter;
  commands?: ChannelCommandAdapter;
  doctor?: ChannelDoctorAdapter;
  // ...
}
```
### 7.4 Provider Plugin Interface
File: src/plugin-sdk/provider-entry.ts

```typescript
// Provider plugin phải export default:
export default {
  id: "anthropic",
  type: "provider",
  providers: ["anthropic"],
  catalog(ctx): ProviderCatalogResult { ... },
  auth(ctx): Promise<ProviderAuthResult> { ... },
  normalizeTransport(ctx) { ... },
  wrapStream(ctx) { ... },
  // hooks:
  beforeAgentReply?(ctx) { ... },
  prepareRuntimeAuth?(ctx) { ... },
}
```
### 7.5 Plugin Loader
File: src/plugins/loader.ts

```text
loadOpenClawPlugins()
    │
    ├── Scan bundled plugin dirs (extensions/)
    ├── Scan workspace plugin dirs (config.plugins.entries)
    ├── Parse openclaw.plugin.json manifest per plugin
    ├── Import plugin entry file (dynamic import)
    ├── Register in PluginRegistry
    └── Return registry
```
### 7.6 Plugin SDK Entrypoints
```text
openclaw/plugin-sdk/core          → src/plugin-sdk/core.ts
openclaw/plugin-sdk/plugin-entry  → src/plugin-sdk/plugin-entry.ts
openclaw/plugin-sdk/provider-entry → src/plugin-sdk/provider-entry.ts
openclaw/plugin-sdk/channel-contract → src/plugin-sdk/channel-contract.ts
src/plugins/loader.ts, src/plugin-sdk/, package.json exports

```
## 8. AGENT (PI) RUNTIME
### 8.1 Pi Agent Core
OpenClaw dùng @mariozechner/pi-coding-agent như engine AI:

SessionManager — quản lý lịch sử hội thoại
createAgentSession() — khởi tạo session
DefaultResourceLoader — load tool schemas, docs
### 8.2 Luồng thực thi Agent
File: src/agents/agent-command.ts → src/agents/pi-embedded-runner/run.ts → run/attempt.ts

```text
agentCommand(opts)
    │
    ├── resolveSession()               # Load/create session store entry
    ├── resolveAgentRunContext()        # Build run context
    ├── runAgentAttempt()              # Core run
    │       │
    │       └── runWithModelFallback()
    │               │
    │               └── runEmbedded(params)
    │                       │
    │                       ├── resolveModelAsync()     # Chọn model
    │                       ├── ensureAuthProfileStore() # Auth
    │                       ├── resolveAuthProfileOrder()
    │                       │
    │                       └── (loop: max retries)
    │                               │
    │                               └── runEmbeddedAttempt()
    │                                       │
    │                                       ├── createAgentSession(provider, model, history)
    │                                       ├── buildSystemPrompt()
    │                                       ├── injectBootstrapContext() # workspace docs
    │                                       ├── injectSkills()           # active skills
    │                                       ├── injectMcpTools()
    │                                       ├── injectChannelTools()
    │                                       │
    │                                       └── SessionManager.run(userMessage)
    │                                               │
    │                                               ├── → LLM API (streaming)
    │                                               │     (Anthropic/OpenAI/Google/...)
    │                                               ├── emit deltas → WS subscribers
    │                                               ├── handle tool_call:
    │                                               │     bash_tool, browser_*, file_*,
    │                                               │     message_*, sessions_*, canvas_*
    │                                               └── → final text
    │
    ├── deliverAgentCommandResult()     # Send reply
    └── updateSessionStoreAfterAgentRun()
```
### 8.3 Tool System
Mỗi lần agent gọi tool, Pi agent executor:

Extract tool_call từ LLM stream
Look up tool implementation
Execute (bash, browser CDP, file ops, ...)
Return tool_result back to LLM
Built-in tools trong system prompt: bash, browser_*, canvas_*, message.*, sessions.*, node.invoke, v.v.

### 8.4 Compaction
File: src/agents/pi-embedded-runner/compact.ts

Khi context gần overflow → compact.ts gọi LLM để tạo summary → thay thế lịch sử cũ bằng summary.

### 8.5 Model Fallover
File: src/agents/pi-embedded-runner/run.ts

```text
Nếu model thất bại (rate limit, auth error, context overflow):
    ├── markAuthProfileFailure()
    ├── resolveRunFailoverDecision()
    └── retry với profile/model khác
src/agents/agent-command.ts, src/agents/pi-embedded-runner/run.ts, src/agents/pi-embedded-runner/run/attempt.ts

```
## 9. LUỒNG TIN NHẮN
### 9.1 Luồng Inbound (kênh → agent)
```text
[Kênh messaging (WhatsApp/Telegram/...)]
    │ Nhận tin nhắn mới
    ▼
[Channel Plugin: ChannelMessagingAdapter.onMessage()]
    │ Tạo MsgContext { sender, text, attachments, channelId, ... }
    ▼
[channels/run-state-machine.ts]
    │ Command gating (mentionGating, commandGating)
    │ Pairing check (nếu chưa paired → gửi code)
    │ Group policy check
    ▼
[routing/resolve-route.ts: resolveRoute()]
    │ Xác định sessionKey từ sender/channel/thread
    ▼
[auto-reply/dispatch.ts: dispatchInboundMessage()]
    │ finalizeInboundContext()
    │ createReplyDispatcherWithTyping()
    │ dispatchReplyFromConfig()
    ▼
[auto-reply/reply.ts: getReplyFromConfig()]
    │ Enqueue in command lane
    ▼
[agents/agent-command.ts: agentCommand()]
    │ (xem mục 8.2)
    ▼
[auto-reply/reply/reply-dispatcher.ts]
    │ deliverReply(text, channel, target)
    ▼
[Channel Plugin: ChannelOutboundAdapter.send()]
    │ Chunk text nếu cần
    │ Retry policy
    ▼
[Tin nhắn được gửi về cho người dùng]
```
### 9.2 Luồng từ CLI / WebChat
```text
User → `openclaw agent --message "..."` hoặc WebChat
    │
    ├── CLI: cli/gateway-cli/
    │   └── WS call: chat.send { key, message }
    │
    └── WebChat: browser POST /chat
        → Gateway WS handler: chat.ts chatHandlers["chat.send"]
            │
            ├── parseMessageWithAttachments()
            ├── resolveSessionKeyForRun()
            ├── dispatchInboundMessage() hoặc agentCommand() trực tiếp
            └── stream events back qua WS
src/auto-reply/dispatch.ts, src/gateway/server-methods/chat.ts, src/channels/run-state-machine.ts

```
## 10. CHANNELS
### 10.1 Danh sách kênh có sẵn (bundled)
| Channel | Extension | Thư viện |
|---|---|---|
| WhatsApp | extensions/whatsapp | @whiskeysockets/baileys |
| Telegram | extensions/telegram | grammy |
| Discord | extensions/discord | discord.js |
| Slack | extensions/slack | @slack/bolt |
| Signal | extensions/signal | signal-cli (process bridge) |
| iMessage/BlueBubbles | extensions/bluebubbles | BlueBubbles API |
| IRC | extensions/irc | irc |
| Microsoft Teams | extensions/msteams | MS Teams API |
| Matrix | extensions/matrix | matrix-js-sdk |
| Feishu | extensions/feishu | Feishu API |
| LINE | extensions/line | LINE Messaging API |
| Mattermost | extensions/mattermost | Mattermost API |
| Google Chat | extensions/googlechat | Google Chat API |
| Zalo | extensions/zalo | Zalo API |
| WebChat | Core (src/channel-web.ts) | Built-in |
| Nostr | extensions/nostr | nostr-tools |
| Twitch | extensions/twitch | tmi.js |
| Tlon | extensions/tlon | Tlon API |
### 10.2 Lifecycle Channel
```text
channel.start()     → connect / authenticate
channel.onMessage() → inbound dispatch
channel.send()      → outbound delivery
channel.status()    → health check
channel.stop()      → disconnect
```
### 10.3 DM Policy
Mặc định: dmPolicy = "pairing" — sender lạ nhận pairing code. Config: channels.<id>.dmPolicy = "open" | "pairing" | "allowlist" | "disabled"

src/channels/plugins/, src/config/types.base.ts:9

## 11. ROUTING & SESSION
### 11.1 Session Key
File: src/routing/session-key.ts

Session key = composite string xác định một conversation context:

```text
<agentId>/<channelId>/<accountId>/<peerId>
ví dụ: default/telegram/12345/67890
```
### 11.2 Session Store
File: src/config/sessions/store.ts

Session entries lưu trong ~/.openclaw/agents/<agentId>/sessions/sessions.json:

```json
{
  "default/telegram/12345/67890": {
    "model": "claude-sonnet-4.6",
    "thinkingLevel": "low",
    "createdAt": "...",
    "lastActiveAt": "..."
  }
}
```
### 11.3 Session Transcript
File: src/config/sessions/transcript.ts

Transcript lưu trong ~/.openclaw/agents/<agentId>/sessions/<key>.jsonl — mỗi dòng là một message JSON.

### 11.4 Multi-agent
Config agents.entries cho phép nhiều agent, mỗi agent có agentId, workspaceDir riêng:

```json
{
  "agents": {
    "entries": {
      "work": { "agentDir": "~/work-workspace", "model": "gpt-5.4" },
      "personal": { "agentDir": "~/personal", "model": "claude-sonnet-4.6" }
    }
  }
}
src/routing/session-key.ts, src/config/sessions/, src/config/types.agents.ts

```
## 12. CONFIG & STATE
### 12.1 Config File
Path: ~/.openclaw/openclaw.json (hoặc OPENCLAW_HOME)

Root type: OpenClawConfig (src/config/types.openclaw.ts)

```typescript
type OpenClawConfig = {
  meta?: { lastTouchedVersion?, lastTouchedAt? }
  auth?: AuthConfig          // Token, password, mode
  gateway?: GatewayConfig    // port, bind, tls, tailscale
  channels?: ChannelsConfig  // Per-channel settings
  agents?: AgentsConfig      // agent defaults, multi-agent
  models?: ModelsConfig      // Primary model, fallbacks
  plugins?: PluginsConfig    // Plugin entries, disabled list
  hooks?: HooksConfig        // Webhook handlers, Gmail
  skills?: SkillsConfig      // Active skills
  sessions?: SessionConfig   // Pruning, compaction settings
  memory?: MemoryConfig      // Memory plugin config
  browser?: BrowserConfig    // Browser CDP settings
  tools?: ToolsConfig        // Tool permissions
  cron?: CronConfig          // Cron jobs
  logging?: LoggingConfig    // Log level, file
  secrets?: SecretsConfig    // Secret resolution
  acp?: AcpConfig            // ACP binding
  env?: { vars?, shellEnv? } // Env vars
  // ...
}
```
### 12.2 Config I/O
File: src/config/io.ts

readConfigFileSnapshot() — đọc + validate
writeConfigFile(config) — write + backup rotation
loadConfig() — cached hot-read (bản sync)
registerConfigWriteListener() — subscribe to writes
Hot-reload: startGatewayConfigReloader() dùng fs.watch theo dõi file
### 12.3 State Directory
```text
~/.openclaw/
├── openclaw.json                # Config chính
├── credentials/                 # Provider credentials
├── agents/
│   └── <agentId>/
│       ├── sessions/
│       │   ├── sessions.json    # Session store
│       │   └── *.jsonl          # Transcripts
│       └── workspace/           # Pi agent workspace
│           ├── AGENTS.md
│           ├── BOOT.md          # Boot task
│           └── skills/          # Installed skills
├── media/                       # Temp media files
├── browser/                     # Browser profiles
└── logs/                        # Log files
src/config/paths.ts, src/config/io.ts, src/config/types.openclaw.ts

```
## 13. MEDIA PIPELINE
File: src/media/

```text
```
Inbound attachment (image/audio/video/pdf)
    │
    ├── parseMediaFromMessage()       # Detect type, download
    ├── inbound-path-policy.ts        # Path safety check
    ├── image-ops.ts (với sharp)      # Resize/convert → PNG/JPEG
    │   └── max: MAX_IMAGE_BYTES      # src/media/constants.ts
    ├── audio.ts (với ffmpeg)         # Audio conversion
    ├── pdf-extract.ts                # PDF text extraction
    │
    └── saveMediaBuffer()             # Lưu vào ~/.openclaw/media/
        └── Trả về SavedMedia { path, url }
            └── URL phục vụ qua media HTTP server
                src/media/server.ts (port 18790 mặc định)
Supported formats:

Images: PNG, JPEG, WebP, GIF → resize nếu quá lớn
Audio: MP3, OGG, WAV, M4A → transcription qua OpenAI Whisper
Video: MP4 → frame extraction
PDF: text extraction
Documents: plain text
src/media/store.ts, src/media/image-ops.ts, src/media/audio.ts

## 14. TTS / VOICE
### 14.1 TTS
File: src/tts/

```text
```
tts.ts: speakText(text, config)
    │
    └── provider-registry.ts: resolveActiveProvider()
            ├── ElevenLabs (extensions/elevenlabs)
            ├── OpenAI TTS (extensions/openai: tts-1, tts-1-hd)
            └── System TTS fallback (macOS say)
Config: config.tts.provider = "elevenlabs" | "openai" | "system"

### 14.2 Voice Wake
App: macOS/iOS (apps/macos/Sources/OpenClaw/)

Wake word detection → forward đến openclaw-mac agent --message "${text}"
VoiceWakeForwarder.swift → shell-escape text → CLI
### 14.3 Talk Mode
Continuous voice conversation trên macOS/iOS/Android. Protocol qua WS talk.* methods.

### 14.4 Realtime Transcription
Extension: extensions/deepgram, extensions/openai (Realtime API)

src/tts/tts.ts, src/tts/provider-registry.ts

## 15. HOOKS / AUTOMATION
### 15.1 Internal Hooks
File: src/hooks/internal-hooks.ts

```typescript
// Hook events:
"before-agent-start"   // Trước khi agent run
"before-agent-reply"   // Sau khi có reply, trước khi gửi
"before-tool-call"     // Trước khi tool được gọi
"after-tool-call"      // Sau khi tool hoàn thành
"before-install"       // Trước khi cài plugin
"model-override"       // Override model dynamically
Hooks có thể implement bởi plugin (export hooks object).

```
### 15.2 Gmail Pub/Sub
File: src/hooks/gmail-watcher.ts

Gmail push notification → webhook → dispatchInboundMessage()

### 15.3 Webhooks
File: src/gateway/server-http.ts, src/plugin-sdk/webhook-ingress.ts

HTTP POST /api/webhooks/<hookId> → match hook config → trigger agent

### 15.4 Cron Jobs
File: src/gateway/server-cron.ts

Config-driven cron (config.cron.entries) → buildGatewayCronService() → schedule với cron expression → dispatchInboundMessage() khi trigger.

src/hooks/, src/gateway/server-cron.ts

## 16. PAIRING & BẢO MẬT
### 16.1 Device Pairing
File: src/pairing/

Khi DM từ sender chưa biết:

Tạo pairingChallenge (random code, 6 ký tự)
Gửi code cho sender
Operator approve: openclaw pairing approve <channel> <code>
Sender được add vào local allowlist (pairing-store.ts)
### 16.2 Gateway Auth
Modes: src/gateway/auth.ts

"none" — no auth (dev)
"token" — ******
"password" — HTTP basic/form
"tailscale" — Tailscale identity header
### 16.3 Device Token
macOS/iOS/Android app tạo key pair, đăng ký device token qua device.pair WS method. Sau đó dùng deviceToken trong ConnectParams.auth.

### 16.4 SecretRef
Secrets trong config có thể là:

```json
{ "$secret": "ENV_VAR_NAME" }
// hoặc
{ "$secret": { "env": "API_KEY" } }
// hoặc plain string
```
Resolved tại runtime bởi secrets/runtime.ts.

### 16.5 SSRF Protection
File: src/plugin-sdk/ssrf-policy.ts

Private IP addresses bị block cho outbound webhook requests trừ khi explicitly whitelisted.

src/pairing/, src/gateway/auth.ts, src/secrets/

## 17. COMPANION APPS
17.1 macOS App (Swift/SwiftUI)
Path: apps/macos/Sources/OpenClaw/

| File | Chức năng |
|---|---|
| AppState.swift | Root state (@Observable) |
| GatewayManager.swift | Gateway WS connection |
| CanvasManager.swift | Canvas window |
| VoiceWakeForwarder.swift | Wake word → CLI |
| CanvasWindowController.swift | Canvas host |
| ChannelsSettings.swift | Channel config UI |
Build: pnpm mac:package → scripts/package-mac-app.sh Protocol: Kết nối Gateway qua WS với mode: "mac-app" trong ConnectParams

17.2 iOS App
Path: apps/ios/Sources/

Node mode: pair với Gateway, expose device capabilities
Canvas viewer
Voice Wake (on-device)
Build: pnpm ios:build (XcodeGen + xcodebuild)
### 17.3 Android App
Path: apps/android/

Kotlin + Gradle (Play + Third-party variants)
Connect tab (setup code/QR), Chat, Voice, Canvas
Camera/Screen recording/SMS/Location/Notifications tools
Build: pnpm android:assemble
### 17.4 Shared Kit
Path: apps/shared/OpenClawKit/Sources/ Swift package chia sẻ giữa macOS và iOS: protocol types, Gateway client, OpenClawProtocol.

apps/macos/, apps/ios/, apps/android/

## 18. UI WEB (CONTROL UI)
Path: ui/

Vite + React (inferred from build config)
Serve từ Gateway tại /web
Build: pnpm ui:build
Features: Channel status, Config editor, Session list, WebChat, Skills manager, Model picker, Cron manager, Exec approvals
## 19. TESTING & CI
### 19.1 Test Framework
Vitest với nhiều config cho từng domain:
| Config file | Domain |
|---|---|
| vitest.config.ts | Default (unit) |
| vitest.gateway.config.ts | Gateway |
| vitest.channels.config.ts | Channels |
| vitest.extensions.config.ts | Extensions |
| vitest.unit.config.ts | Unit + coverage |
| vitest.e2e.config.ts | E2E |
| vitest.live.config.ts | Live (real API keys) |
| vitest.bundled.config.ts | Bundled plugins |
| vitest.contracts.config.ts | Contract tests |
| vitest.commands.config.ts | CLI commands |
### 19.2 Chạy test
```bash
pnpm test                    # Default unit tests
pnpm test:gateway            # Gateway tests
pnpm test:extensions         # Extension tests
pnpm test:coverage           # With coverage
OPENCLAW_LIVE_TEST=1 pnpm test:live  # Live API tests
pnpm test:docker:onboard     # Docker onboard E2E
```
### 19.3 CI (GitHub Actions)
Path: .github/workflows/

ci.yml — main CI: check + test + build-smoke
check-additional — architecture/boundary policy
test:docker:* — Docker-based E2E tests
deadcode:ci — dead code detection
### 19.4 Pre-commit hook
File: git-hooks/pre-commit

```text
pnpm format   # Oxfmt check
pnpm check    # tsgo + oxlint + lint guards
vitest.config.ts, .github/workflows/, git-hooks/pre-commit

```
## 20. BUILD SYSTEM
### 20.1 TypeScript Build
File: tsdown.config.ts

```text
pnpm build
    ├── scripts/bundle-a2ui.sh         # Bundle A2UI
    ├── scripts/tsdown-build.mjs       # tsdown (bundler) → dist/
    ├── scripts/runtime-postbuild.mjs  # Post-process
    ├── scripts/build-stamp.mjs        # Build stamp
    ├── pnpm build:plugin-sdk:dts      # Plugin SDK .d.ts
    ├── scripts/write-plugin-sdk-entry-dts.ts
    ├── scripts/canvas-a2ui-copy.ts
    ├── scripts/copy-hook-metadata.ts
    ├── scripts/write-build-info.ts
    └── scripts/write-cli-startup-metadata.ts
```
Output: dist/ — ESM modules Entry: dist/index.js (library), dist/entry.js (CLI)

### 20.2 Plugin Build
Mỗi extension trong extensions/<id>/ có package.json riêng với tsdown build. Postinstall (scripts/postinstall-bundled-plugins.mjs) cài deps.

### 20.3 Docker
File: Dockerfile, docker-compose.yml

Dockerfile
# Gateway only (minimal)
FROM node:22-alpine
RUN npm install -g openclaw@latest
CMD ["openclaw", "gateway", "run"]
### 20.4 Nix
Supported qua OPENCLAW_NIX_MODE=1 env var và nix flake tại github:openclaw/nix-openclaw.

### 20.5 Dev Loop
```bash
pnpm install
pnpm ui:build          # Control UI
pnpm build             # Full build
pnpm gateway:watch     # Dev: auto-reload on change
pnpm openclaw ...      # Run TypeScript trực tiếp (tsx)
```
package.json:scripts, tsdown.config.ts, Dockerfile

## 21. SƠ ĐỒ LUỒNG CHÍNH
### 21.1 Sequence: Khởi động Gateway
```text
openclaw gateway run
    │
    ├─[1]─ entry.ts: normalizeEnv, parseArgs
    ├─[2]─ run-main.ts → tryRouteCli() → gateway-cli/
    ├─[3]─ gateway/server.impl.ts: startGatewayServer(18789)
    │       ├─ readConfigFileSnapshot()  → openclaw.json
    │       ├─ loadGatewayStartupPlugins()
    │       │    └─ extensions/anthropic, openai, telegram, discord, ...
    │       ├─ prepareSecretsRuntimeSnapshot()
    │       ├─ startGatewaySidecars()
    │       │    ├─ loadInternalHooks()
    │       │    ├─ startChannels() → WhatsApp.start(), Telegram.start(), ...
    │       │    └─ startPluginServices()
    │       ├─ createHttpServer().listen(18789)
    │       └─ attachGatewayWsHandlers()
    │
    └─[4]─ "Gateway started at ws://127.0.0.1:18789"
```
### 21.2 Sequence: Nhận tin nhắn từ WhatsApp → Reply
```text
[WhatsApp] nhận DM "hello"
    │
    ├─[1]─ baileys onMessage event
    ├─[2]─ WhatsApp channel plugin: ChannelMessagingAdapter.onMessage()
    │       → tạo MsgContext { sender: "+1234", text: "hello", channelId: "whatsapp", ... }
    ├─[3]─ run-state-machine.ts: kiểm tra pairing, allowlist, group policy
    ├─[4]─ routing/resolve-route.ts: sessionKey = "default/whatsapp/+1234/+1234"
    ├─[5]─ auto-reply/dispatch.ts: dispatchInboundMessage()
    ├─[6]─ process/command-queue.ts: enqueue in lane "default"
    ├─[7]─ agents/agent-command.ts: agentCommand(message, sessionKey)
    │       ├─ load session history từ ~/.openclaw/agents/default/sessions/...
    │       ├─ resolveModelAsync() → "claude-sonnet-4.6"
    │       └─ SessionManager.run("hello") → Anthropic API
    │           ├─ stream tokens...
    │           └─ final: "Hi there! How can I help?"
    ├─[8]─ reply-dispatcher.ts: chunkText() nếu cần
    ├─[9]─ WhatsApp channel plugin: ChannelOutboundAdapter.send()
    └─[10]─ [WhatsApp] gửi "Hi there! How can I help?" cho user
```
### 21.3 Sequence: Load Level (plugin install)
```text
openclaw plugins install <npm-package>
    │
    ├─[1]─ cli/plugins-cli.ts: installCommand()
    ├─[2]─ plugins/install.ts: resolveInstallPlan()
    │       ├─ npm install <package> vào plugins dir
    │       └─ validate openclaw.plugin.json manifest
    ├─[3]─ config/mutate.ts: writePluginEntry() → update openclaw.json
    ├─[4]─ gateway WS: config.reload → plugins.reload
    │       └─ loadOpenClawPlugins() again
    └─[5]─ Plugin active trong runtime
```
### 21.4 Sequence: Agent Tool Call (bash)
```text
SessionManager.run("list files in /tmp")
    │
    └─[LLM] → tool_call: { name: "bash", args: { command: "ls /tmp" } }
    │
    ├─[1]─ agents/bash-tools.exec-host-gateway.ts: execHostGateway()
    │       ├─ kiểm tra exec approval policy
    │       ├─ spawn process
    │       └─ return { stdout, stderr, exitCode }
    │
    └─[2]─ tool_result → LLM → "Found 5 files: ..."
    │
    └─[3]─ Final text → reply pipeline → kênh
```
## 22. API QUAN TRỌNG
### 22.1 Core Functions
| Function | File | Mô tả |
|---|---|---|
| startGatewayServer(port, opts) | src/gateway/server.impl.ts:411 | Khởi động toàn bộ Gateway |
| runCli(argv) | src/cli/run-main.ts | Main CLI dispatcher |
| agentCommand(opts) | src/agents/agent-command.ts | Top-level agent run |
| dispatchInboundMessage(params) | src/auto-reply/dispatch.ts | Inbound message dispatch |
| loadConfig() | src/config/io.ts | Read config (cached) |
| writeConfigFile(config) | src/config/io.ts | Write + backup config |
| loadOpenClawPlugins() | src/plugins/loader.ts | Load all plugins |
| resolveRoute(ctx, cfg) | src/routing/resolve-route.ts | Route message to session |
| saveMediaBuffer(buf, opts) | src/media/store.ts | Save media attachment |
| speakText(text, config) | src/tts/tts.ts | TTS dispatch |
### 22.2 Key Types
| Type | File | Mô tả |
|---|---|---|
| OpenClawConfig | src/config/types.openclaw.ts | Root config type |
| GatewayServer | src/gateway/server.impl.ts | Running gateway handle |
| ChannelPlugin | src/channels/plugins/types.plugin.ts | Channel plugin interface |
| OpenClawPluginDefinition | src/plugins/types.ts | Provider plugin definition |
| PluginManifest | src/plugins/manifest.ts | Plugin manifest struct |
| MsgContext | src/auto-reply/templating.ts | Inbound message context |
| SessionEntry | src/config/sessions/types.ts | Session store entry |
| AgentCommandOpts | src/agents/command/types.ts | Agent run options |
| ConnectParams | src/gateway/protocol/schema/frames.ts | WS connect params |
| RuntimeEnv | src/runtime.ts | Runtime I/O abstraction |
### 22.3 Protocol Error Codes
File: src/gateway/protocol/schema/error-codes.ts

```typescript
export const ErrorCodes = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // ...
}
```
## 23. MVP CLONE ROADMAP
Phase 1 — Gateway minimal (2–3 tuần)
Mục tiêu: Gateway WS + CLI + config + 1 channel + 1 provider

 Config system: ~/.openclaw/openclaw.json, loadConfig(), writeConfigFile()
 Entry/CLI: entry.ts, cli/run-main.ts, commander setup, openclaw gateway run
 Gateway WS server: server.impl.ts stripped down: HTTP server, WS upgrade, connect/hello handshake
 Protocol schema: TypeBox schemas cho frames.ts (ConnectParams, HelloOk), sessions.ts
 1 Provider (OpenAI): plugin manifest, auth (API key), catalog(), wrapStream()
 1 Channel (Telegram hoặc WebChat): channel plugin với lifecycle, messaging, outbound
 Routing + Session: resolve-route.ts, session-key.ts, session store (JSON file)
 Agent command: agentCommand() stripped: load history, call OpenAI, return text
 Reply pipeline: chunk text, send qua channel outbound
Kết quả: openclaw gateway run → chat qua Telegram/WebChat

Phase 2 — Multi-channel + Auth (1–2 tuần)
 Thêm 2–3 kênh (Discord, WhatsApp, Slack)
 Pairing system (pairing/)
 Gateway auth (token-based)
 DM policy (pairing/open)
 Config hot-reload
Phase 3 — Tools + Media (2 tuần)
 Bash tool (bash-tools.exec-host-gateway.ts)
 Media pipeline (images, audio)
 Browser CDP tool (extensions/browser)
 File read/write tools
Phase 4 — Advanced (ongoing)
 Multi-agent (agents.entries)
 Plugin system (npm-based loading)
 Cron + webhooks
 TTS/Voice
 macOS/iOS/Android companion apps
 MCP integration (mcporter bridge)
 Canvas/A2UI
 Memory plugin
 Compaction + model failover
 Control UI (web)
 Nix/Docker packaging
 Tailscale integration
Những file cần implement trước tiên:
```text
```
src/runtime.ts
src/version.ts
src/entry.ts
src/cli/run-main.ts
src/cli/route.ts
src/config/paths.ts
src/config/io.ts
src/config/types.openclaw.ts  (+ sub-types)
src/config/schema.ts
src/gateway/protocol/schema/frames.ts
src/gateway/protocol/schema/sessions.ts
src/gateway/server.impl.ts   (stripped)
src/gateway/server-methods/chat.ts (basic)
src/routing/session-key.ts
src/routing/resolve-route.ts
src/auto-reply/dispatch.ts
src/agents/agent-command.ts  (stripped)
src/agents/defaults.ts
src/channels/plugins/types.plugin.ts
extensions/openai/  (provider plugin)
extensions/telegram/ (channel plugin, hoặc webchat)
