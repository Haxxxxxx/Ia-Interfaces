# Rodeo CLI

AI coding assistant for your terminal with GPU acceleration support. Edit code, run commands, and get help with development tasks.

## Installation

### npm (recommended)
```bash
npm install -g @rodeo/cli
```

### From source
```bash
git clone https://github.com/your-org/rodeo.git
cd rodeo/cli
npm install && npm run build
npm link
```

## Quick Start

1. **Configure your API key:**
   ```bash
   rodeo --init
   ```

2. **Start coding:**
   ```bash
   cd your-project
   rodeo
   ```

## Usage

```bash
# Interactive mode
rodeo

# Ask a question directly
rodeo "how do I fix this TypeScript error?"

# Configure settings
rodeo --init

# Multiple sessions
rodeo --new frontend    # Terminal 1
rodeo --new backend     # Terminal 2

# Show help
rodeo --help
```

## Features

- **Code Editing** - Read, write, and edit files directly
- **Shell Commands** - Run any command in your project
- **GPU Acceleration** - Connect to local or cloud GPUs
- **Shadow Cloud** - Use remote GPU for faster inference
- **Rich Output** - Syntax highlighting and formatting
- **Streaming** - See responses as they're generated
- **Multi-Session** - Run parallel sessions for different tasks

---

## Shadow Cloud GPU Setup

Connect to a Shadow cloud VPS with GPU for accelerated inference.

### Quick Setup (on Shadow VPS)

```bash
# One-line setup
curl -fsSL https://ollama.com/install.sh | sh && \
sudo mkdir -p /etc/systemd/system/ollama.service.d && \
echo -e '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0:11434"' | \
sudo tee /etc/systemd/system/ollama.service.d/override.conf && \
sudo systemctl daemon-reload && sudo systemctl restart ollama && \
sudo ufw allow 11434/tcp && ollama pull qwen2.5-coder:7b
```

### Connect from Rodeo

```bash
# In Rodeo CLI
/shadow YOUR_SHADOW_IP:11434
/gpu
/models
```

### Full Guide

See [SHADOW-CONNECTION.md](./SHADOW-CONNECTION.md) for complete setup instructions.

---

## Commands

### General
| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/quit` | Exit the CLI |
| `/clear` | Clear conversation history |

### Editing
| Command | Description |
|---------|-------------|
| `/undo` | Undo last edit |
| `/rollback` | Undo all session changes |
| `/changes` | Show all changes made |

### Git
| Command | Description |
|---------|-------------|
| `/git` | Git status overview |
| `/diff` | Show uncommitted changes |
| `/commit` | Generate commit message |
| `/branch` | List/switch branches |

### System
| Command | Description |
|---------|-------------|
| `/gpu` | Show GPU & Ollama status |
| `/setup` | Shadow cloud setup guide |
| `/shadow <url>` | Connect to Shadow cloud |
| `/ollama <url>` | Set custom Ollama URL |
| `/models` | List available models |
| `/model <id>` | Change the AI model |

### Sessions
| Command | Description |
|---------|-------------|
| `/sessions` | List active sessions |
| `/save [name]` | Save conversation |
| `/load <name>` | Load conversation |

### Explore
| Command | Description |
|---------|-------------|
| `/map` | Codebase structure |
| `/explore` | Quick overview |
| `/context` | Project info |

---

## Configuration

Config is stored in `~/.rodeo/config.json`:

```json
{
  "apiUrl": "http://localhost:3000",
  "apiKey": "your-api-key",
  "model": "qwen2.5-coder:7b",
  "shadowUrl": "http://YOUR_SHADOW_IP:11434"
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `RODEO_API_KEY` | Your API key |
| `RODEO_API_URL` | Server URL |
| `RODEO_MODEL` | Default model |
| `RODEO_SHADOW_URL` | Shadow cloud URL |
| `RODEO_SESSION_NAME` | Session name |

---

## Model Recommendations

| GPU VRAM | Recommended Model | Command |
|----------|------------------|---------|
| 8GB | qwen2.5-coder:7b | `ollama pull qwen2.5-coder:7b` |
| 16GB | qwen2.5-coder:14b | `ollama pull qwen2.5-coder:14b` |
| 24GB | qwen2.5:32b | `ollama pull qwen2.5:32b` |
| 48GB+ | qwen2.5:72b | `ollama pull qwen2.5:72b` |

---

## Self-Hosted Server

The CLI connects to a Rodeo server. To run your own:

```bash
cd rodeo/app
npm install
npm run dev
```

See the main README for full server setup.

---

## Scripts

Helper scripts for Shadow setup:

```bash
# On Shadow VPS
./scripts/shadow-vps-setup.sh

# On local machine
./scripts/connect-shadow.sh YOUR_SHADOW_IP

# Install models interactively
./scripts/install-models.sh
```

---

## License

MIT
