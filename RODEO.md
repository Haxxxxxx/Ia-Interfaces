# Rodeo Project Context

## Project Overview
Rodeo is an AI coding assistant ecosystem with:
- **CLI** (`/cli`) - Terminal-based AI assistant with tool calling, similar to Claude Code
- **Web App** (`/app`) - Next.js dashboard for managing API keys, usage, and instances
- **Desktop** (`/desktop`) - Electron wrapper (planned)

## Architecture

### Directory Structure
```
/
├── app/                  # Next.js web application
│   ├── src/app/         # App router pages and API routes
│   │   ├── api/         # API endpoints (chat, models, auth)
│   │   └── dashboard/   # Dashboard pages
│   └── src/lib/         # Shared utilities
├── cli/                  # Rodeo CLI
│   ├── rodeo.ts         # Main CLI source (single file)
│   ├── dist/            # Compiled output
│   └── scripts/         # Setup scripts for Shadow cloud
├── config/              # Shared configuration
├── docs/                # Documentation
└── scripts/             # Project-level scripts
```

### Key Technologies
- **CLI**: TypeScript, Node.js, Ollama (local LLM), OpenAI-compatible API
- **Web App**: Next.js 14, Tailwind CSS, SQLite (via Prisma), React
- **Styling**: Orange theme (#F97316), dark terminal aesthetic

## Coding Conventions

### TypeScript
- Use strict mode
- Prefer `const` over `let`
- Use async/await over callbacks
- Single quotes for strings

### CLI Specific
- All CLI code is in a single file: `cli/rodeo.ts`
- Tool names use PascalCase (Read, Edit, Write, Bash, Glob, Grep)
- Color output uses ANSI codes via the `c` object (c.purple, c.green, etc.)
- Orange (#F97316) is the primary accent color

### Web App
- Use App Router patterns
- API routes in `/app/api/`
- Tailwind for styling with terminal- prefixed custom colors

## Important Files

### CLI
- `cli/rodeo.ts` - **Main CLI source** - ALL CLI logic is here (~7500 lines)
- `cli/package.json` - CLI package config
- `cli/scripts/` - Shadow cloud setup scripts

### Web App
- `app/src/app/api/v1/chat/completions/route.ts` - Main chat API endpoint
- `app/src/app/page.tsx` - Landing page
- `app/src/app/dashboard/` - Dashboard pages
- `app/tailwind.config.ts` - Theme configuration

## Common Tasks

### Building
```bash
# CLI
cd cli && npm run build

# Web App
cd app && npm run build
```

### Running
```bash
# CLI (development)
cd cli && npm run dev

# Web App
cd app && npm run dev
```

### Testing the CLI
```bash
cd cli && npm run build && node dist/rodeo.js
```

## Things to Avoid

- Don't split `rodeo.ts` into multiple files - it's designed as a single-file CLI
- Don't use purple for primary colors - use orange (#F97316)
- Don't add emojis unless the user explicitly requests them
- Don't create new documentation files without being asked
- Don't modify `node_modules/` or `dist/` directories
- Don't commit `.env` files or API keys

## Dependencies

### CLI
- `tsx` - TypeScript execution
- No other runtime dependencies (uses Node.js built-ins)

### Web App
- `next` - React framework
- `tailwindcss` - Styling
- `better-sqlite3` - Database
- `ollama` - LLM integration

## GPU/Cloud Setup
The CLI supports:
- Local Ollama (default)
- Shadow cloud GPU via `/shadow <url>` command
- See `cli/SHADOW-CONNECTION.md` for setup guide

---
*This file helps Rodeo AI understand this codebase better.*
