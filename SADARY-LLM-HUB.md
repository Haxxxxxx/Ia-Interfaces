# Sadary LLM Hub — Project Spec for Claude Code

> **Owner:** Rémi Gaconier (via Sadary / Optivity)
> **Team:** 5 members (Rémi, Pauline, Vincent + 2 devs)
> **LLM Engine:** Kimi K2.5 API (Moonshot AI) — **frontier-level, $0.60/M input, $2.50/M output**
> **Orchestration:** Hostinger VPS (KVM 8) — lightweight API proxy + team management
> **Client:** Desktop natif (Electron/Tauri) — remplace Claude Code / Cursor / Copilot
> **Domain:** llm.sadary.xyz
> **Repo:** GitHub — `sadary-dev/llm-hub`

### ⚠️ STRATEGY
> **Kimi K2.5 via API Moonshot = modèle à 1 trillion de paramètres pour le prix de tokens Ollama 7B.**
> Self-host K2.5 coûterait ~$500-1000/mo (GPU cloud). L'API coûte ~$15-50/mo.
> C'est 20-60x moins cher pour la même qualité. Zero infra GPU à gérer.

### ⚠️ COST RULE
> Budget: **~$35-70/mo total** (VPS $20 + tokens $15-50).
> Remplace: Cursor ($20/mo) + API Anthropic/OpenAI tokens (variable) + ChatGPT Plus ($20/mo).
> **ROI immédiat** — meilleur modèle, moins cher, plus de contrôle.

### ⚠️ BRANDING RULE
> **Aucune référence à WeSplit** dans le code, le domaine, les configs, ou le repo.
> Cette infra est opérée sous **Sadary** (structure perso de Rémi).
> L'équipe WeSplit y accède comme utilisateurs, pas comme propriétaires.

---

## 1. Architecture Overview

### Kimi K2.5 API + Desktop Client + VPS Proxy

```
┌─────────────────────────────────────────────────────────────────┐
│                    DESKTOP CLIENT (Tauri)                        │
│               Sadary Hub — client natif par membre              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐    │
│  │ Chat Panel  │  │ Code Editor │  │  Agent Tasks Panel   │    │
│  │ (streaming) │  │ (Monaco)    │  │  (file ops, shell)   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬───────────┘    │
│         │                │                     │                 │
│         └────────────────┼─────────────────────┘                │
│                          │                                       │
│                          ▼                                       │
│              ┌───────────────────────┐                           │
│              │  Local Agent Runtime  │                           │
│              │  (file I/O, shell,    │                           │
│              │   git, npm, cargo)    │                           │
│              └───────────┬───────────┘                           │
│                          │                                       │
└──────────────────────────┼──────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              HOSTINGER VPS — llm.sadary.xyz                      │
│              API Proxy + Team Management + Usage Tracking        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Next.js API Server (port 3000)                        │     │
│  │                                                        │     │
│  │  /api/v1/chat/completions  → Proxy to Moonshot API     │     │
│  │  /api/v1/models            → Model catalog             │     │
│  │  /api/instances            → Instance CRUD             │     │
│  │  /api/team                 → Member management         │     │
│  │  /api/usage                → Token tracking per user   │     │
│  │  /api/auth                 → API key auth              │     │
│  │                                                        │     │
│  │  Rate limiting: per-user, per-model budgets            │     │
│  │  Caching: repeated system prompts → 75% input savings  │     │
│  │  Logging: all requests → SQLite (audit trail)          │     │
│  └────────────────────────────┬───────────────────────────┘     │
│                               │                                  │
│  ┌────────────────┐  ┌───────▼──────────────────────────┐       │
│  │ Cloudflare     │  │  Moonshot API Relay               │       │
│  │ Tunnel         │  │  api.moonshot.ai/v1               │       │
│  │ (zero-trust)   │  │                                   │       │
│  └────────────────┘  │  Models:                          │       │
│                      │  ├─ kimi-k2.5          (flagship)  │       │
│                      │  ├─ kimi-k2-0905       (fast)      │       │
│                      │  └─ kimi-k2-thinking   (reasoning) │       │
│                      │                                   │       │
│                      │  Features:                        │       │
│                      │  ├─ 256K context window            │       │
│                      │  ├─ Thinking mode (CoT)            │       │
│                      │  ├─ Tool calling (native)          │       │
│                      │  ├─ Vision (images + video)        │       │
│                      │  ├─ Agent Swarm (100 parallel)     │       │
│                      │  └─ Auto context caching (75% off) │       │
│                      └───────────────────────────────────┘       │
│                                                                  │
│  SQLite DB: usage tracking, instances, team, audit logs          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Request Flow

```
Desktop Client (Tauri)
  → HTTPS POST to llm.sadary.xyz/api/v1/chat/completions
  → VPS validates API key + checks rate limits + logs request
  → VPS proxies to api.moonshot.ai/v1/chat/completions (with Moonshot API key)
  → SSE stream: Moonshot → VPS → Desktop Client
  → VPS logs tokens used (input + output + cached)
  → Desktop Client renders response (streaming)
  → If tool_call: Desktop executes locally (file I/O, shell, git)
  → Desktop sends tool_result back → next API call

Moonshot API key = 1 key on VPS, shared by proxy. Users never see it.
Per-user auth = Sadary Hub API keys (generated by admin).
```

### Why This Architecture

```
❌ Ancien setup (Ollama local):
   - CPU-only → 3-10 tok/s (20-30x plus lent qu'un GPU)
   - Modèles max 20B → loin du frontier
   - 16 GB RAM → max 2 modèles
   - Aucun tool calling fiable
   - Pas de vision/multimodal

✅ Nouveau setup (Kimi K2.5 API):
   - 1 TRILLION de paramètres (MoE, 32B activés)
   - ~60-100 tok/s (Moonshot infrastructure GPU)
   - 256K context window
   - Tool calling natif (fonction calling, code exec)
   - Vision native (images + vidéo)
   - Thinking mode (raisonnement step-by-step)
   - Agent Swarm (jusqu'à 100 agents parallèles)
   - Auto context caching (75% réduction input cost)
   - OpenAI SDK compatible (drop-in replacement)
   - ~$15-50/mo pour 5 personnes vs $20/mo pour du 3 tok/s
```

---

## 2. Kimi K2.5 — Model Details

### 2.1 Models Available

| Model ID | Type | Context | Input $/M | Output $/M | Cache $/M | Speed | Use Case |
|----------|------|---------|-----------|------------|-----------|-------|----------|
| `kimi-k2.5` | **Flagship** | 256K | $0.60 | $2.50 | $0.15 | ~60 tok/s | Tout — chat, code, agent, vision |
| `kimi-k2-0905` | Fast | 128K | $0.60 | $2.50 | $0.15 | ~60 tok/s | Chat rapide, drafts |
| `kimi-k2-thinking` | Reasoning | 128K | $0.60 | $2.50 | $0.15 | ~40 tok/s | Math, logic, deep analysis |
| `kimi-k2-thinking-turbo` | Fast reasoning | 128K | $1.15 | $8.00 | - | ~100 tok/s | Speed-critical reasoning |

> **Default model: `kimi-k2.5`** — flagship, multimodal, agent-capable.
> Switching models mid-conversation = instantané (pas de swap GPU).

### 2.2 Key Capabilities

```yaml
# Kimi K2.5 — What it can do that Ollama 7B cannot:

thinking_mode:
  description: "Deep reasoning with visible chain-of-thought"
  usage: "Automatic in kimi-k2.5, explicit in kimi-k2-thinking"
  api: "response.choices[0].message.reasoning_content"

tool_calling:
  description: "Native function calling — model decides when to use tools"
  supported_tools:
    - file_read / file_write / file_search
    - shell_exec (bash, git, npm, cargo)
    - web_search (via $web_search built-in)
    - code_interpreter
    - custom_functions (user-defined)

vision:
  description: "Native image + video understanding"
  input_types: ["image/png", "image/jpeg", "video/mp4"]
  use_cases:
    - "UI screenshot → code generation"
    - "Diagram → architecture analysis"
    - "Video → step-by-step description"

agent_swarm:
  description: "Self-directed parallel agent execution"
  max_agents: 100
  use_cases:
    - "Research: parallel web searches + synthesis"
    - "Code review: parallel file analysis"
    - "Testing: parallel test execution"

context_caching:
  description: "Automatic — repeated system prompts cached at 75% discount"
  cached_input_price: "$0.15/M (vs $0.60/M normal)"
  config: "No configuration needed — automatic"
```

### 2.3 API Configuration

```bash
# Moonshot API — OpenAI-compatible
BASE_URL=https://api.moonshot.ai/v1
API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx  # From platform.moonshot.ai

# Rate Limits (scale with cumulative recharge):
# Tier 0 ($0):   3 concurrent, 30 RPM, 1.5M tokens/day
# Tier 1 ($10):  50 concurrent, 200 RPM, unlimited daily
# Tier 2 ($100): 200 concurrent, 5000 RPM, unlimited
# Tier 3 ($500): 500 concurrent, 10000 RPM, unlimited

# Recommendation: Recharge $100 → Tier 2 (200 concurrent, 5K RPM)
# More than enough for 5 team members.
# Bonus: $5 free voucher when cumulative recharge hits $5.
```

### 2.4 Team Member → Model Mapping

| Member | Role | Primary Model | Use Cases |
|--------|------|---------------|-----------|
| Vincent (CTO) | Code review, Solana contracts | `kimi-k2.5` (thinking mode) | Code gen, PR review, architecture, debugging |
| Pauline (CEO) | Comms, docs, social | `kimi-k2.5` (instant mode) | Drafts, emails, social posts, presentations |
| Rémi (COO) | Business, strategy, code | `kimi-k2.5` (thinking mode) | Analysis, financial models, grant writing |
| Devs | Code, debug, testing | `kimi-k2.5` (thinking mode) | Code gen, testing, PR review |

> **Tous sur le même modèle K2.5** — plus de compromis de qualité.
> Thinking mode pour les tâches complexes, instant mode pour le chat rapide.

### 2.5 Cost Estimation (5 users)

```
Average usage per person per day:
  - ~50 messages (mix simple + complex)
  - ~5,000 input tokens per message (with system prompt + context)
  - ~1,000 output tokens per message
  - ~250,000 input tokens/day/person
  - ~50,000 output tokens/day/person

With context caching (~60% cache hit rate):
  - Cached input: 150,000 × $0.15/M = $0.0225
  - Non-cached input: 100,000 × $0.60/M = $0.06
  - Output: 50,000 × $2.50/M = $0.125
  - Per person per day: ~$0.21
  - Per person per month (22 days): ~$4.60
  - Team of 5 per month: ~$23

Conservative estimate: $15-50/mo depending on usage intensity.
Heavy usage (Vincent doing multi-file code review all day): maybe $60-80/mo total.

Compare to current spending:
  - Cursor: $20/mo × N users
  - Claude API tokens: variable
  - ChatGPT Plus: $20/mo × N users
  - Total current: easily $100-200+/mo

Savings: 50-80% with better model quality.
```

---

## 3. VPS — API Proxy + Team Management

### 3.1 Hostinger VPS

| Plan | vCPU | RAM | Storage | Prix |
|------|------|-----|---------|------|
| **KVM 4** (suffisant) | 4 cores | 8 GB | 100 GB NVMe | ~$12/mo |

> **Downgrade possible!** Le VPS ne fait plus d'inférence.
> Il sert uniquement de proxy API + team management + usage tracking.
> KVM 4 (8 GB RAM, 4 cores) suffit largement pour un Next.js + SQLite.
> Économie: $8/mo vs l'ancien KVM 8.

### 3.2 VPS Role

```
Le VPS fait:
  ✅ Proxy API (relaye les requêtes vers Moonshot, ajoute l'API key)
  ✅ Auth team (chaque membre a sa propre API key Sadary Hub)
  ✅ Rate limiting (budgets par utilisateur, par modèle)
  ✅ Usage tracking (tokens consommés par user, par jour, par instance)
  ✅ Instance management (conversations nommées, contexte persistant)
  ✅ Audit logging (toutes les requêtes loggées)
  ✅ Dashboard web (stats, team management — fallback si pas le client desktop)
  ✅ Cloudflare Tunnel (zero-trust, pas d'IP exposée)

Le VPS ne fait PAS:
  ❌ Inférence LLM (c'est Moonshot qui run les GPUs)
  ❌ Stockage de modèles (pas d'Ollama)
  ❌ Calcul GPU
```

### 3.3 Cloudflare Tunnel

```bash
# Même setup qu'avant — zero-trust, pas de ports ouverts
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb

cloudflared tunnel login
cloudflared tunnel create llm-hub

cat > /etc/cloudflared/config.yml << 'EOF'
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: llm.sadary.xyz
    service: http://localhost:3000
    originRequest:
      connectTimeout: 10s
      keepAliveTimeout: 120s
      keepAliveConnections: 100
  - service: http_status:404
EOF

cloudflared tunnel route dns llm-hub llm.sadary.xyz
cloudflared service install
systemctl enable cloudflared && systemctl start cloudflared
```

---

## 4. Desktop Client — Sadary Hub (Tauri)

### 4.1 Why Tauri (Not Electron)

```
Tauri:
  ✅ ~3 MB binary (vs ~150 MB Electron)
  ✅ Native Rust backend → fast file I/O, shell exec
  ✅ Lower RAM (~50 MB vs ~300 MB Electron)
  ✅ Native OS integration (system tray, notifications, file dialogs)
  ✅ macOS + Windows + Linux
  ✅ Webview-based UI (React frontend)
  ✅ No bundled Chromium
  ✅ Secure by default (allowlist for APIs)

Perfect for a "Claude Code replacement" client:
  - Small, fast, always running in background
  - Can execute local tools (shell, file ops, git)
  - React frontend for the UI
  - Rust backend for the agent runtime
```

### 4.2 UI Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Sadary Hub                                    ─ □ ×  │
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│ SIDEBAR  │  MAIN PANEL                                          │
│          │                                                       │
│ ┌──────┐ │  ┌─────────────────────────────────────────────────┐ │
│ │ 🏠   │ │  │ instance-name: wesplit-contracts                │ │
│ │ Home │ │  │ model: kimi-k2.5 (thinking) · 42.3K tokens     │ │
│ │      │ │  ├─────────────────────────────────────────────────┤ │
│ ├──────┤ │  │                                                 │ │
│ │ 💬   │ │  │ rémi > Analyse ce smart contract Solana et      │ │
│ │ Chat │ │  │        identifie les vulnérabilités potentielles │ │
│ │      │ │  │                                                 │ │
│ ├──────┤ │  │ ┌─ thinking ──────────────────────────────────┐ │ │
│ │ 🗂️   │ │  │ │ Let me analyze the contract structure...    │ │ │
│ │Inst. │ │  │ │ Checking for reentrancy patterns...          │ │ │
│ │      │ │  │ │ Evaluating PDA derivation security...        │ │ │
│ │ List:│ │  │ └─────────────────────────────────────────────┘ │ │
│ │      │ │  │                                                 │ │
│ │ ws-  │ │  │ kimi > I've identified 3 potential issues:      │ │
│ │ cont │ │  │                                                 │ │
│ │ ract │ │  │ **1. Missing signer check** on `update_config`  │ │
│ │      │ │  │    The instruction doesn't verify that the      │ │
│ │ seed │ │  │    caller is the program authority...            │ │
│ │ deck │ │  │                                                 │ │
│ │      │ │  │ **2. Unchecked arithmetic** in `distribute()`   │ │
│ │ news │ │  │    Line 142: potential overflow...               │ │
│ │ lett │ │  │                                                 │ │
│ │      │ │  │ [▶ Applied fix to programs/wesplit/src/lib.rs]  │ │
│ ├──────┤ │  │                                                 │ │
│ │ ⚡   │ │  ├─────────────────────────────────────────────────┤ │
│ │Agent │ │  │                                                 │ │
│ │Tasks │ │  │ > _                                             │ │
│ │      │ │  │                                                 │ │
│ ├──────┤ │  │ [Model ▾] [Thinking ◉] [Tools ✓]  Send ⏎      │ │
│ │ 📊   │ │  └─────────────────────────────────────────────────┘ │
│ │Usage │ │                                                       │
│ │      │ │  STATUS BAR:                                          │
│ │ $4.23│ │  kimi-k2.5 · thinking · 42.3K ctx · $0.12 session   │
│ │ /mo  │ │  llm.sadary.xyz ● connected · rémi · 2/5 online     │
│ └──────┘ │                                                       │
├──────────┴───────────────────────────────────────────────────────┤
│ ⌘K Command Palette  │  Ctrl+N New Instance  │  Ctrl+T Toggle    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Key Features

```yaml
chat:
  streaming: true  # SSE from VPS proxy
  markdown_render: true  # Full markdown + code highlighting
  thinking_display: true  # Show reasoning_content in collapsible block
  vision_input: true  # Paste/drag images → sent as base64
  code_blocks: "Monaco editor with syntax highlighting"
  
tools_local:  # Executed on user's machine, NOT on VPS
  file_read: "Read any file on user's machine"
  file_write: "Create/edit files"
  file_search: "Glob/regex search in project directory"
  shell_exec: "Run bash/zsh commands (with user confirmation)"
  git_ops: "git status, diff, commit, push (with confirmation)"
  browser_open: "Open URLs"
  clipboard: "Read/write clipboard"

instances:
  create: "Named conversations with persistent context"
  switch: "Instant switch between instances (Ctrl+Tab)"
  share: "Share instance with team member (read-only or collaborate)"
  export: "Export conversation as markdown"
  
settings:
  model_select: "Switch between kimi-k2.5 / k2-0905 / k2-thinking"
  thinking_toggle: "Enable/disable thinking mode per instance"
  system_prompt: "Custom system prompt per instance"
  temperature: "0.6 (instant) / 1.0 (thinking) — adjustable"
  working_directory: "Set project root for file operations"
  budget_alert: "Notify when approaching monthly token budget"
```

### 4.4 Agent Runtime (Rust Backend — Tauri)

```rust
// Tauri commands exposed to frontend

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    // Read file from user's filesystem
    // Called when Kimi K2.5 requests file_read tool
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    // Write file — requires user confirmation in UI
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn exec_shell(command: String, cwd: Option<String>) -> Result<ShellOutput, String> {
    // Execute shell command — requires user confirmation
    // Returns stdout, stderr, exit_code
    let output = Command::new("sh")
        .arg("-c")
        .arg(&command)
        .current_dir(cwd.unwrap_or_else(|| ".".into()))
        .output()
        .map_err(|e| e.to_string())?;
    
    Ok(ShellOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

#[tauri::command]
async fn search_files(pattern: String, cwd: String) -> Result<Vec<String>, String> {
    // Glob search in project directory
    // Used by Kimi for file discovery
}
```

### 4.5 Tool Calling Flow

```
1. User sends message: "Fix the bug in src/lib.rs line 42"
2. Desktop → VPS proxy → Moonshot API (with tools schema)
3. Kimi K2.5 responds with tool_call: { name: "file_read", args: { path: "src/lib.rs" } }
4. Desktop receives tool_call → shows confirmation UI
5. User confirms → Tauri reads file locally
6. Desktop sends tool_result back → VPS → Moonshot
7. Kimi analyzes file → responds with tool_call: { name: "file_write", args: { path: "src/lib.rs", content: "..." } }
8. User confirms → Tauri writes file
9. Kimi sends final summary message

Key: Tool execution is LOCAL on user's machine.
     Only the tool schema + results transit via VPS/Moonshot.
     Files never leave the user's computer.
```

---

## 5. VPS API Server

### 5.1 API Routes

```typescript
// All routes are OpenAI-compatible where possible.
// Desktop client talks to VPS as if it were an OpenAI API.

// Chat completions (proxy to Moonshot)
POST   /api/v1/chat/completions    → Proxy with auth + logging
GET    /api/v1/models              → Available models

// Instance management
GET    /api/instances              → List user's instances
POST   /api/instances              → Create instance
GET    /api/instances/:id          → Get instance with messages
PUT    /api/instances/:id          → Update instance (name, model, system prompt)
DELETE /api/instances/:id          → Archive instance

// Team management (admin only)
GET    /api/team                   → List members
POST   /api/team                   → Invite member (generate API key)
PUT    /api/team/:id               → Update member (role, budget)
DELETE /api/team/:id               → Revoke access

// Usage tracking
GET    /api/usage                  → Current user's usage
GET    /api/usage/team             → Team-wide usage (admin)
GET    /api/usage/daily            → Daily breakdown

// Health
GET    /api/health                 → VPS + Moonshot API status
```

### 5.2 Moonshot Proxy Client

```typescript
// File: app/src/lib/moonshot-client.ts
import OpenAI from "openai";

const moonshot = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: "https://api.moonshot.ai/v1",
});

// Chat with streaming
export async function chat(params: {
  model: string;
  messages: any[];
  tools?: any[];
  stream?: boolean;
  thinking?: boolean;
}) {
  const { model, messages, tools, stream = true, thinking = true } = params;

  const extra: any = {};
  if (!thinking) {
    extra.extra_body = { thinking: { type: "disabled" } };
  }

  return moonshot.chat.completions.create({
    model,
    messages,
    tools,
    stream,
    max_tokens: 8192,
    temperature: thinking ? 1.0 : 0.6,
    top_p: 0.95,
    ...extra,
  });
}

// List models
export async function listModels() {
  return moonshot.models.list();
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    await moonshot.models.list();
    return true;
  } catch {
    return false;
  }
}
```

### 5.3 Chat Proxy Route (SSE Streaming)

```typescript
// File: app/src/app/api/v1/chat/completions/route.ts
import { NextRequest } from "next/server";
import { chat } from "@/lib/moonshot-client";
import { validateApiKey, logUsage, checkBudget } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // 1. Auth
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Budget check
  const budget = await checkBudget(user.id);
  if (budget.exceeded) {
    return Response.json({ 
      error: "Monthly budget exceeded",
      usage: budget 
    }, { status: 429 });
  }

  // 3. Parse request
  const body = await req.json();
  const { model, messages, tools, stream = true } = body;

  // 4. Determine thinking mode
  const thinking = body.thinking !== false; // default: true for k2.5

  // 5. Proxy to Moonshot
  const response = await chat({ model, messages, tools, stream, thinking });

  if (stream) {
    // Stream SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let inputTokens = 0;
        let outputTokens = 0;

        for await (const chunk of response as any) {
          // Forward chunk to client
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(data));

          // Track usage from final chunk
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        // Log usage async
        logUsage(user.id, model, inputTokens, outputTokens);
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } else {
    // Non-streaming
    const result = response as any;
    await logUsage(
      user.id,
      model,
      result.usage?.prompt_tokens || 0,
      result.usage?.completion_tokens || 0
    );
    return Response.json(result);
  }
}
```

### 5.4 Database Schema (Drizzle + SQLite)

```typescript
// File: app/src/db/schema.ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull(),
  email: text("email"),
  role: text("role").notNull().default("member"), // admin | member
  apiKey: text("api_key").notNull().unique(),
  monthlyBudget: real("monthly_budget").default(20.0), // $ max per month
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const instances = sqliteTable("instances", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  model: text("model").notNull().default("kimi-k2.5"),
  systemPrompt: text("system_prompt"),
  thinking: integer("thinking", { mode: "boolean" }).default(true),
  status: text("status").default("active"), // active | archived
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  instanceId: text("instance_id").references(() => instances.id),
  role: text("role").notNull(), // user | assistant | system | tool
  content: text("content"),
  reasoningContent: text("reasoning_content"), // thinking mode output
  toolCalls: text("tool_calls"), // JSON array of tool calls
  toolCallId: text("tool_call_id"), // for tool results
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  cachedTokens: integer("cached_tokens").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const usageLogs = sqliteTable("usage_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cachedTokens: integer("cached_tokens").default(0),
  costUsd: real("cost_usd").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

---

## 6. Docker Compose (VPS)

```yaml
# File: docker-compose.yml
# Lightweight — NO Ollama, NO GPU. Just API proxy + app.

services:
  llm-hub:
    build: ./app
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - MOONSHOT_API_KEY=${MOONSHOT_API_KEY}
      - DATABASE_URL=file:/data/llmhub.db
      - SESSION_SECRET=${SESSION_SECRET}
      - NODE_ENV=production
    volumes:
      - app-data:/data  # SQLite DB + logs
    deploy:
      resources:
        limits:
          memory: 512M  # Next.js needs very little for a proxy
          cpus: "1"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  watchtower:
    image: containrrr/watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=86400  # Check daily

volumes:
  app-data:
    driver: local

# That's it. 2 services. ~600 MB RAM total.
# Compare to old setup: Ollama (14 GB) + App (1 GB) + models (40 GB disk).
```

---

## 7. Tool Definitions (Kimi K2.5 Function Calling)

```typescript
// File: app/src/lib/tools-schema.ts
// These tool schemas are sent with every API call.
// Kimi K2.5 decides when to invoke them.
// Execution happens on the DESKTOP CLIENT, not on VPS.

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file on the user's machine",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file on the user's machine",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string", description: "File path to write" },
          content: { type: "string", description: "File content" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace a specific string in a file (must be unique in file)",
      parameters: {
        type: "object",
        required: ["path", "old_string", "new_string"],
        properties: {
          path: { type: "string" },
          old_string: { type: "string", description: "Exact string to find (must be unique)" },
          new_string: { type: "string", description: "Replacement string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell_exec",
      description: "Execute a shell command on the user's machine. Use for git, npm, cargo, etc.",
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for files matching a glob pattern in the project",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string", description: "Glob pattern (e.g., '**/*.rs', 'src/**/*.ts')" },
          cwd: { type: "string", description: "Search root directory" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and directories at a given path",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string", description: "Directory path to list" },
        },
      },
    },
  },
];
```

---

## 8. Repo Structure

```
sadary-dev/llm-hub/
│
├── README.md
├── docker-compose.yml
├── .env.example
│
├── app/                           # VPS API Server (Next.js)
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx            # Dashboard (web fallback)
│       │   ├── api/
│       │   │   ├── v1/
│       │   │   │   ├── chat/completions/route.ts  # Moonshot proxy
│       │   │   │   └── models/route.ts
│       │   │   ├── instances/route.ts
│       │   │   ├── team/route.ts
│       │   │   ├── usage/route.ts
│       │   │   └── health/route.ts
│       │   └── dashboard/          # Web UI (fallback)
│       │       ├── page.tsx
│       │       ├── instances/page.tsx
│       │       ├── team/page.tsx
│       │       └── usage/page.tsx
│       ├── lib/
│       │   ├── moonshot-client.ts   # Moonshot API wrapper
│       │   ├── auth.ts              # API key validation
│       │   ├── rate-limit.ts        # Per-user rate limiting
│       │   ├── usage.ts             # Token tracking + cost calc
│       │   └── cost.ts              # Pricing calculation
│       └── db/
│           ├── schema.ts            # Drizzle schema
│           ├── index.ts             # DB connection
│           └── migrations/
│
├── desktop/                         # Desktop Client (Tauri + React)
│   ├── Cargo.toml                   # Rust workspace
│   ├── tauri.conf.json
│   ├── package.json
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs             # Tauri entry
│   │   │   ├── commands.rs          # File I/O, shell, git commands
│   │   │   ├── agent.rs             # Tool execution runtime
│   │   │   └── config.rs            # User settings
│   │   └── Cargo.toml
│   └── src/                         # React frontend
│       ├── App.tsx
│       ├── main.tsx
│       ├── components/
│       │   ├── ChatPanel.tsx         # Main chat with streaming
│       │   ├── ThinkingBlock.tsx     # Collapsible reasoning display
│       │   ├── ToolCallUI.tsx        # Tool confirmation dialog
│       │   ├── CodeBlock.tsx         # Monaco-based code display
│       │   ├── InstanceList.tsx      # Sidebar instance list
│       │   ├── ModelSelector.tsx     # Model + thinking toggle
│       │   ├── UsageIndicator.tsx    # Token cost in status bar
│       │   ├── CommandPalette.tsx    # Ctrl+K
│       │   └── StatusBar.tsx         # Connection, user, cost
│       ├── lib/
│       │   ├── api-client.ts        # HTTP client to VPS
│       │   ├── stream-parser.ts     # SSE parser for chat
│       │   └── tool-executor.ts     # Bridges Kimi tools ↔ Tauri commands
│       └── styles/
│           └── globals.css
│
├── scripts/
│   ├── provision.sh                 # VPS initial setup
│   ├── deploy.sh                    # Pull & restart services
│   ├── add-team-member.sh           # Generate API key for member
│   ├── backup.sh                    # Backup SQLite DB
│   └── setup-tunnel.sh             # Cloudflare Tunnel setup
│
└── config/
    ├── models.yaml                  # Model catalog + pricing
    └── cloudflared.yml              # Tunnel config
```

---

## 9. .env.example

```bash
# Moonshot API (THE key — stored only on VPS, never in client)
MOONSHOT_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# App
SESSION_SECRET=generate-a-random-string-here
DATABASE_URL=file:/data/llmhub.db
NODE_ENV=production

# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token

# Rate Limits (defaults)
DEFAULT_MONTHLY_BUDGET_USD=20.0
DEFAULT_RPM_LIMIT=30
MAX_CONTEXT_TOKENS=128000

# VPS (reference only)
DOMAIN=llm.sadary.xyz
```

---

## 10. Cost Estimation

| Item | Cost/month |
|------|-----------|
| Hostinger KVM 4 (or KVM 8) | $12-20 |
| Moonshot API tokens (5 users, moderate) | $15-50 |
| Cloudflare Tunnel (free plan) | $0 |
| Domain (sadary.xyz — existing) | $0 |
| Tauri desktop client | $0 (open-source) |
| **Total** | **~$27-70/mo** |

> **Compare to current costs (estimated):**
> - Cursor: $20/mo × users
> - Claude API tokens: variable ($20-100+/mo)
> - ChatGPT Plus: $20/mo × users
> - Copilot: $10/mo × users
> - **Current total: $100-300+/mo for worse models**
>
> **Sadary Hub: $27-70/mo for a 1T-param frontier model.**
> **Savings: 60-80%. Better quality. Full control. Full audit trail.**

---

## 11. Implementation Phases

### Phase 1: VPS API Proxy (Week 1)
```
Priority: Get the API proxy working so team can use Kimi K2.5 immediately.

1. [ ] Setup Moonshot account + recharge $100 (Tier 2)
2. [ ] Setup Hostinger VPS + Cloudflare Tunnel
3. [ ] Init Next.js project with API routes
4. [ ] Implement /api/v1/chat/completions proxy
5. [ ] Implement auth (API keys per user)
6. [ ] Implement usage tracking (SQLite)
7. [ ] Deploy to VPS
8. [ ] Generate API keys for team members
9. [ ] Team can immediately use via curl or any OpenAI-compatible client:
       curl -X POST https://llm.sadary.xyz/api/v1/chat/completions \
         -H "Authorization: Bearer sadary-key-remi-xxxx" \
         -H "Content-Type: application/json" \
         -d '{"model":"kimi-k2.5","messages":[{"role":"user","content":"Hello"}]}'
```

### Phase 2: Web Dashboard (Week 2)
```
10. [ ] Build web dashboard (instances, usage, team management)
11. [ ] Build web chat UI (fallback for when desktop not available)
12. [ ] Instance management (create, name, switch, archive)
13. [ ] Usage charts per user
14. [ ] Budget alerts
```

### Phase 3: Desktop Client (Week 3-4)
```
15. [ ] Init Tauri project + React frontend
16. [ ] Build chat panel with SSE streaming
17. [ ] Build thinking block display
18. [ ] Build tool calling UI (confirmation dialogs)
19. [ ] Implement Rust agent runtime (file_read, file_write, shell_exec)
20. [ ] Build instance sidebar
21. [ ] Build command palette (Ctrl+K)
22. [ ] Build model selector + thinking toggle
23. [ ] Build usage indicator in status bar
24. [ ] Build settings (working directory, system prompt, budget alerts)
25. [ ] Package for macOS + Windows + Linux
26. [ ] Distribute to team
```

### Phase 4: Advanced Features (Week 5+)
```
27. [ ] Multi-file tool calls (batch file operations)
28. [ ] Git integration (auto-commit suggestions)
29. [ ] Project context loading (auto-include relevant files)
30. [ ] Custom system prompts library (per project type)
31. [ ] Instance sharing between team members
32. [ ] Keyboard shortcuts matching Claude Code / Cursor
33. [ ] Vision support (paste screenshot → code)
```

---

## 12. Notes pour Claude Code

- **API-first:** Le VPS est un proxy léger. Tout le compute est chez Moonshot. Pas d'Ollama.
- **OpenAI SDK compatible:** Moonshot expose un endpoint `/v1/chat/completions` identique à OpenAI. Utiliser le package `openai` npm.
- **Streaming obligatoire:** SSE pour le chat. Kimi K2.5 supporte le streaming nativement.
- **Thinking mode:** Par défaut activé sur kimi-k2.5. Le `reasoning_content` est dans `response.choices[0].message.reasoning_content`. L'afficher dans un bloc collapsible.
- **Tool calling:** Kimi K2.5 a du function calling natif. Les tool schemas sont envoyés avec chaque requête. L'exécution est côté client desktop (Tauri), pas côté VPS.
- **Context caching:** Automatique chez Moonshot. Pas de config. Les system prompts répétés sont cachés à 75% de réduction. Optimiser en gardant des system prompts stables.
- **Tauri pour le desktop:** Pas Electron. Plus léger (~3 MB vs ~150 MB), plus rapide, Rust backend natif pour les opérations filesystem. React pour le frontend.
- **Auth simple:** API key par utilisateur, générée par l'admin. Stockée côté VPS dans SQLite. Le client desktop stocke sa key dans le keychain OS natif.
- **Budget tracking:** Calculer le coût de chaque requête: `(input_tokens × $0.60/M) + (output_tokens × $2.50/M)`. Loger dans SQLite. Alerter quand un user approche son budget mensuel.
- **Pas de rate limiting Moonshot agressif:** Avec $100 de recharge (Tier 2), on a 200 requêtes concurrentes et 5000 RPM. Largement suffisant pour 5 personnes.
- **Framework:** Next.js 14 App Router pour le VPS. Tauri 2 + React pour le desktop.
- **Style:** Terminal/CLI aesthetic pour le desktop. Fond sombre, monospace, minimal. Comme Claude Code mais en mieux.
- **Dyslexie-friendly:** JetBrains Mono, espacement généreux, bonne lisibilité.
- **No WeSplit references:** Tout sous Sadary.
- **Phase 1 priority:** Le proxy API doit marcher en premier. L'équipe peut utiliser Kimi K2.5 via curl/Postman/any OpenAI client dès la semaine 1, avant même que le desktop client soit prêt.

### Terminal Theme (same as before — preserved)

```typescript
// File: tailwind.config.ts (partial)
{
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0D1117",
          surface: "#161B22",
          border: "#30363D",
          text: "#C9D1D9",
          muted: "#8B949E",
          accent: "#58A6FF",
          green: "#3FB950",
          red: "#F85149",
          yellow: "#D29922",
          purple: "#BC8CFF",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
}
```
