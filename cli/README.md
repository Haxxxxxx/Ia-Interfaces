# Bubbl CLI

AI coding assistant for your terminal. Edit code, run commands, and get help with development tasks.

## Installation

### npm (recommended)
```bash
npm install -g @bubbl/cli
```

### From source
```bash
git clone https://github.com/your-org/bubbl.git
cd bubbl/cli
npm install && npm run build
npm link
```

## Quick Start

1. **Configure your API key:**
   ```bash
   bubbl --init
   ```

2. **Start coding:**
   ```bash
   cd your-project
   bubbl
   ```

## Usage

```bash
# Interactive mode
bubbl

# Ask a question directly
bubbl "how do I fix this TypeScript error?"

# Configure settings
bubbl --init

# Show help
bubbl --help
```

## Features

- **Code Editing** - Read, write, and edit files directly
- **Shell Commands** - Run any command in your project
- **Rich Output** - Syntax highlighting, tables, and formatting
- **Streaming** - See responses as they're generated
- **Context Aware** - Works in any directory

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/quit` | Exit the CLI |
| `/clear` | Clear conversation history |
| `/model <id>` | Change the AI model |
| `/status` | Check API connection |
| `/render` | Test rich text rendering |

## Configuration

Config is stored in `~/.bubbl/config.json`:

```json
{
  "apiUrl": "http://localhost:3000",
  "apiKey": "your-api-key",
  "model": "qwen2.5:7b"
}
```

Or use environment variables:
- `BUBBL_API_KEY` - Your API key
- `BUBBL_API_URL` - Server URL
- `BUBBL_MODEL` - Default model

## Self-Hosted Server

The CLI connects to a Bubbl server. To run your own:

```bash
cd bubbl/app
npm install
npm run dev
```

See the main README for full server setup.

## License

MIT
