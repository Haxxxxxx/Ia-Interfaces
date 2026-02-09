# Rodeo - Self-Hosted AI Coding Assistant

## Quick Start

```bash
# One-liner install
curl -fsSL https://raw.githubusercontent.com/Haxxolotto/Ia-Interfaces/main/install.sh | bash
```

Or manually:

```bash
git clone <repo-url> && cd rodeo
npm run install    # Installs everything (Ollama, deps, DB)
npm run server     # Start webapp at http://localhost:3000
```

---

## 🎨 Front-End Developer Setup

Quick setup for designers/front-end devs with Figma integration:

```bash
# 1. Install CLI
cd cli && npm install

# 2. Get Figma token from https://www.figma.com/settings
#    → Personal Access Tokens → Generate new token

# 3. Configure Figma (one command)
./setup-figma.sh figd_YOUR_TOKEN_HERE

# 4. Start coding with Figma
./run.sh
```

### Figma Commands
```bash
/figma files                      # List your Figma files
/figma components <file-key>      # See all components
/figma code <key> <node-id> react # Generate React code
/figma tokens <key>               # Export CSS variables
```

### AI-Powered Design-to-Code
Just ask naturally:
```
"Implement the Button component from figma file ABC123"
"Extract the color palette as Tailwind config"
"Show me the header styles and generate the CSS"
```

📖 **Full guide:** See [FRONTEND-DEV-QUICKSTART.md](./FRONTEND-DEV-QUICKSTART.md)

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run server` | Start Next.js webapp |
| `npm run cli` | Run Rodeo CLI |
| `npm run install` | Full setup (Ollama, deps, DB) |

## Models

| Provider | Models | Cost |
|----------|--------|------|
| **Ollama** | qwen2.5:7b, qwen2.5-coder:7b, llama3.3:70b | FREE |
| **Moonshot** | kimi-k2.5, kimi-k2-thinking | API pricing |
| **DeepSeek** | deepseek-chat, deepseek-coder | API pricing |
