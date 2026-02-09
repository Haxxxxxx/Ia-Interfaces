# Rodeo Implementation Plan - Claude Code Parity

## Current Status: ~98% Parity ✅

## Completed Features ✅

---

### Speed Optimizations ⚡ ✅ COMPLETE
- [x] Speed mode toggle (`/speed`)
- [x] Compact system prompt for faster responses
- [x] File content caching
- [x] Tool result caching (30s TTL)
- [x] `/bench` command for response time tracking
- [x] Session stats tracking

### Batch Operations 📦 ✅ COMPLETE
- [x] `/rename <old> <new>` - Rename symbol across codebase
- [x] `/replace <pattern> <replacement>` - Global search/replace
- [x] Multi-file edit preview
- [x] Find occurrences before changes

### Test Integration 🧪 ✅ COMPLETE
- [x] `/test` - Run project tests
- [x] Auto-detect test runner (jest, vitest, pytest, go test, cargo test)
- [x] Parse test output for failures
- [x] Show test summary with pass/fail counts

### Hooks System 🔗 ✅ COMPLETE
- [x] `~/.rodeo/hooks.json` configuration
- [x] Pre-edit/write/shell hooks
- [x] Post-edit/write/shell hooks
- [x] On-error hooks
- [x] Custom slash commands (`/hooks cmd`)
- [x] File pattern matching for hooks

### MCP Integration 🔌 ✅ FIGMA COMPLETE
- [x] MCP configuration system
- [x] Figma API integration (files, components, styles)
- [x] `/mcp` and `/figma` commands
- [x] AI-callable Figma tools
- [ ] GitHub integration (planned)
- [ ] Slack integration (planned)
- [ ] Notion integration (planned)

### Image Support 🖼️ ✅ COMPLETE
- [x] `/image <path>` - Analyze image files
- [x] `/screenshot` - Capture screen (macOS)
- [x] `/ss -i` - Interactive screenshot selection
- [x] `/paste` - Analyze clipboard image
- [x] URL image support

---

## Remaining Work (for 98% Parity)

### ~~Priority 1: Interrupt & Resume ⏸️~~ ✅ COMPLETE
*Impact: Session persistence*

- [x] Save state on Ctrl+C (double Ctrl+C)
- [x] Resume flag (`rodeo --resume`)
- [x] Notify user of interrupted session on startup

### Priority 1: Side-by-Side Diffs
*Impact: Visual clarity*

- [ ] Split view for diffs
- [ ] Synchronized scrolling

### Priority 3: Additional MCP Integrations
*Impact: Ecosystem expansion*

- [ ] GitHub (issues, PRs, repos)
- [ ] Slack (messages, channels)
- [ ] Notion (pages, databases)

### Priority 4: Templates System
*Impact: Productivity*

- [ ] `/template <name>` - Apply templates
- [ ] Common file scaffolds
- [ ] Custom templates

---

## Success Criteria

| Feature | Status | Notes |
|---------|--------|-------|
| Speed mode | ✅ Done | Compact prompts, caching |
| Batch ops | ✅ Done | /rename, /replace |
| Test integration | ✅ Done | Multi-runner support |
| Hooks | ✅ Done | Pre/post hooks, custom commands |
| MCP (Figma) | ✅ Done | Full API integration |
| Image support | ✅ Done | Screenshots, clipboard, URLs |
| Resume | ✅ Done | Save on exit, --resume flag |
| Side-by-side diffs | 🔄 TODO | Nice to have |

---

## Current Status: ~98% Claude Code Parity

Remaining nice-to-haves:
- Side-by-side diffs: 1 hour
- GitHub MCP: 1 hour
- Templates: 1 hour

**Core feature parity achieved!**
