# Rodeo Feature Roadmap

## Goal: 98% Claude Code Parity

---

## Phase 1: Quick Wins ✅ COMPLETE
*Low effort, high impact*

### 1.1 Git Integration ✅
- [x] Show current branch in prompt
- [x] `/commit` - Auto-generate commit message
- [x] `/diff` - Show uncommitted changes
- [x] `/branch` - List/switch branches
- [x] `/git` - Full git status overview

### 1.2 Thinking Display ✅
- [x] Show "Analyzing..." with context
- [x] Display file names being considered
- [x] Dynamic spinner with thinking state

### 1.3 Compact Mode ✅
- [x] `/compact` toggle
- [x] Reduce output verbosity
- [x] Shorter edit confirmations

### 1.4 Rollback Session ✅
- [x] `/rollback` - Undo all session changes
- [x] `/changes` - Show all session changes
- [x] Track all files modified in session

---

## Phase 2: Better Diffs & Display ✅ MOSTLY COMPLETE
*Visual improvements*

### 2.1 Word-Level Diffs ✅
- [x] Highlight exact changed words/characters
- [x] Color: red strikethrough for removed, green underline for added
- [ ] Side-by-side diff option (TODO)

### 2.2 Syntax Highlighting in Diffs ✅
- [x] Apply language syntax colors in diff view
- [x] Preserve highlighting across +/- lines

### 2.3 Streaming Tool Display ✅
- [x] Show tool name immediately when called
- [x] Stream arguments as they build (dot progress)
- [ ] Progressive result display

### 2.4 Multi-File Summary ✅
- [x] Group changes by file
- [x] Show total lines added/removed
- [x] `/changes` - Summary of all session changes

---

## Phase 3: Smart Context ✅ MOSTLY COMPLETE
*Intelligence improvements*

### 3.1 Auto-Context
- [x] Parse imports/requires from edited files
- [x] Auto-suggest related files to read
- [x] Include type definitions automatically
- [ ] Smart file ranking by relevance

### 3.2 Related Files
- [x] `/related <file>` - Show files that import/use it
- [x] Auto-include test files when editing source
- [x] Detect component dependencies

### 3.3 Project Understanding ✅
- [x] Detect framework (Next.js, Express, etc.)
- [x] Know common file locations
- [x] Understand project structure patterns

---

## Phase 4: Conversation Management ✅ MOSTLY COMPLETE
*Session persistence*

### 4.1 Save/Load Conversations ✅
- [x] `/save [name]` - Save current conversation
- [x] `/load <name>` - Load saved conversation
- [x] Auto-save on exit option (`/autosave`)
- [x] List saved conversations (`/convs`)

### 4.2 Interrupt & Resume ✅
- [x] Ctrl+C saves state before exit
- [x] Resume with `rodeo --resume`
- [x] Notify user of interrupted session on startup
- [x] Restore undo stack and session changes

### 4.3 Conversation Branching
- [ ] `/branch` - Create conversation branch
- [ ] Try different approaches
- [ ] Merge successful branches

---

## Phase 5: Image Support ✅ COMPLETE
*Multimodal capabilities*

### 5.1 Screenshot Reading ✅
- [x] `/screenshot` - Capture and analyze screen (macOS)
- [x] `/ss -i` - Interactive screenshot selection
- [x] Read image files (PNG, JPG, GIF, WebP)
- [x] Describe UI elements (via vision model)

### 5.2 Diagram Understanding ✅
- [x] Parse architecture diagrams (via vision model)
- [x] Understand flowcharts (via vision model)
- [x] Read whiteboard photos (via vision model)

### 5.3 Error Screenshot Analysis ✅
- [x] `/image <path>` - Analyze any image file
- [x] `/image <url>` - Analyze image from URL
- [x] `/paste` - Analyze image from clipboard
- [x] Extract text from images (via vision model)
- [x] Suggest fixes from visual errors (via vision model)

*Note: Requires vision-capable model (llava, bakllava, llama3.2-vision)*

---

## Phase 6: Hooks System ✅ MOSTLY COMPLETE
*Extensibility*

### 6.1 Pre/Post Hooks ✅
- [x] Before tool execution (pre_edit, pre_write, pre_shell)
- [x] After tool completion (post_edit, post_write, post_shell)
- [x] On error hooks (on_error trigger)
- [x] File pattern matching for targeted hooks

### 6.2 Custom Commands ✅
- [x] User-defined slash commands (/hooks cmd)
- [x] Shell script integration
- [ ] Macro recording

### 6.3 Event System
- [ ] On file change
- [ ] On git commit
- [ ] On test failure

---

## Phase 7: Batch Operations ✅ MOSTLY COMPLETE
*Efficiency*

### 7.1 Multi-File Edits
- [x] Same change across multiple files (via /replace)
- [x] Pattern-based replacements
- [ ] Refactoring support

### 7.2 Bulk Operations ✅
- [x] `/rename <old> <new>` - Preview rename across codebase
- [x] `/replace <pattern>` - Preview global search/replace
- [x] Confirm all changes at once (via AI)

### 7.3 Templates
- [ ] `/template <name>` - Apply project templates
- [ ] Common file scaffolds
- [ ] Custom templates

---

## Phase 8: Advanced Features (Partial)
*Power user features*

### 8.1 MCP Integration
- [ ] Connect to external services
- [ ] Figma, GitHub, Slack
- [ ] Custom MCP servers

### 8.2 Test Integration ✅
- [x] `/test` - Run tests
- [x] Auto-detect test runner (jest, vitest, pytest, go, cargo)
- [x] Parse test failures

### 8.3 Debugging Support
- [ ] `/debug` - Start debug session
- [ ] Breakpoint suggestions
- [ ] Variable inspection

### 8.4 Performance Profiling ✅
- [x] Token usage tracking (estimated)
- [x] Response time stats (`/bench`)
- [x] Speed mode for faster responses (`/speed`)

---

## Implementation Order

```
Week 1: Phase 1 + 2 (Foundation)
├── Day 1: Git integration
├── Day 2: Thinking display + Compact mode
├── Day 3: Word-level diffs
└── Day 4: Streaming tools + Multi-file summary

Week 2: Phase 3 + 4 (Intelligence)
├── Day 1: Auto-context
├── Day 2: Related files
├── Day 3: Save/Load conversations
└── Day 4: Interrupt/Resume

Week 3: Phase 5 + 6 (Capabilities)
├── Day 1-2: Image support
└── Day 3-4: Hooks system

Week 4: Phase 7 + 8 (Power Features)
├── Day 1-2: Batch operations
└── Day 3-4: Advanced features
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Claude Code parity | ~98% ✅ | 98% |
| Daily usability | Excellent | Excellent |
| Context awareness | Automatic | Automatic |
| Error recovery | Smart | Smart |
| Visual polish | Professional | Professional |
| Speed optimization | ON (/speed) | Optimized |
| MCP Integration | Figma ✅ | Multi-service |
| Hooks System | ✅ Complete | Complete |
| Interrupt/Resume | ✅ Complete | Complete |

---

## Nice-to-Haves (Beyond 98%)

- [ ] Side-by-side diff option
- [x] ~~Interrupt & Resume~~ ✅ Done
- [ ] GitHub, Slack, Notion MCP integrations
- [ ] Macro recording
- [ ] Templates system
