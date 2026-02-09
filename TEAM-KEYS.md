# Rodeo - Installation Guide for Team

**For: Vincent, Pauline, Remi**

---

## Your API Keys

| Name | API Key | Role |
|------|---------|------|
| **Vincent** | `rodeo-vincent-cd278a95-430` | admin |
| **Pauline** | `rodeo-pauline-46b0e1ea-2e3` | admin |
| **Remi** | `rodeo-remi-90cbd4db-24d` | admin |

> **Keep these keys secure!** They give full access to the Rodeo platform.

---

## Quick Install (5 minutes)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_ORG/rodeo.git
cd rodeo
```

### 2. Run the installer

```bash
./install.sh
```

This will:
- Install Ollama (local LLM runner)
- Download the qwen2.5:7b model (~5GB)
- Install dependencies
- Set up the database

### 3. Start the server

```bash
cd app
npm run dev
```

Server runs at **http://localhost:3000**

### 4. Set up the CLI

```bash
cd cli
npm install && npm run build && npm link
rodeo --init
```

Enter your API key when prompted.

---

## Daily Usage

### Web Interface
1. Open http://localhost:3000
2. Enter your API key
3. Start chatting!

### CLI (Terminal)
```bash
# From any folder in your project:
rodeo

# Or ask directly:
rodeo "fix the TypeScript error in this file"
```

### Dashboard
- **http://localhost:3000/dashboard** - View usage & team
- Login with your API key

---

## Commands Reference

| CLI Command | Description |
|-------------|-------------|
| `rodeo` | Start interactive mode |
| `rodeo "question"` | Ask directly |
| `rodeo --init` | Configure API key |
| `rodeo --help` | Show help |

In session:
- `/help` - Show commands
- `/quit` - Exit
- `/clear` - Clear history
- `/model <id>` - Change model

---

## Troubleshooting

### "Cannot connect to API"
Make sure the server is running:
```bash
cd app && npm run dev
```

### "Model not found"
Pull the model:
```bash
ollama pull qwen2.5:7b
```

### "Ollama not running"
Start Ollama:
```bash
ollama serve
# or on macOS:
open -a Ollama
```

---

## Need Help?

Contact Vincent or check the main README.md

## Local Models (FREE - Self-hosted)

To pull additional models for better performance:

```bash
# Fast coding model (7B - ~5GB, runs on most Macs)
ollama pull qwen2.5-coder:7b

# Better quality (14B - ~9GB, needs 16GB RAM)
ollama pull qwen2.5:14b

# Best for coding (16B - ~10GB, needs GPU with 16GB VRAM)
ollama pull deepseek-coder-v2:16b

# High quality (32B - ~20GB, needs GPU with 24GB VRAM)
ollama pull qwen2.5:32b
```

## GPU Requirements

| Model | Size | Min VRAM | Quality |
|-------|------|----------|---------|
| qwen2.5:7b | 4.7GB | 8GB | Good |
| qwen2.5-coder:7b | 4.7GB | 8GB | Best for code |
| qwen2.5:14b | 9GB | 16GB | Better |
| deepseek-coder-v2:16b | 10GB | 16GB | Excellent for code |
| qwen2.5:32b | 20GB | 24GB | Great |
| llama3.3:70b | 40GB | 48GB | Best |

## Kimi API (Paid)

For users who want to use Kimi K2.5 (Moonshot API):
- Set `MOONSHOT_API_KEY` in your environment
- Select "Kimi K2.5" in the model picker
- Token costs apply per usage
