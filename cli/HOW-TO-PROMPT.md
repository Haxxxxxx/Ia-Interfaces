# How to prompt Rodeo (CLI)

Rodeo runs on a **local model** — sharp but literal. Vague in → drift out.
Specific in → he nails it. This is the cheat sheet for getting real work done.

---

## The skeleton

```
[ACTION] [TARGET/SCOPE] — [CONSTRAINT] — [DONE WHEN]
```

- **ACTION** — a real verb: `refactor`, `fix`, `add`, `move`, `rename`, `split`, `audit`.
  Verbs flip him into *act* mode. "explain / how / why" keep him *read-only*.
- **TARGET/SCOPE** — point at the place so he doesn't flail searching:
  `the render in web/`, `api.py`, `the loose .py files in the root`.
- **CONSTRAINT** — guardrails: `don't change behavior`, `Python only`, `keep imports working`.
- **DONE WHEN** — how he knows he's finished: `until py_compile passes`, `then show me the new tree`.

---

## Bad → Good

| ❌ Vague (drifts) | ✅ Concrete (lands) |
|---|---|
| "clean it up and synthetize the codebase" | "**Reorganize the root**: move the loose `.py` files (`breeding_data.py`, `data_bridge.py`, …) into `modules/`, fix the imports, verify with `python -c 'import api'`." |
| "audit the codebase to find his conditions" | "**Audit `api.py` and `modules/`**: list each module's responsibility and flag dead code or duplication. Read-only — just report, don't edit." |
| "the hierarchy is messy, trim it up" | "**Show me the current file tree** (List), then **propose** a cleaner structure. Don't move anything until I approve." |

---

## Work *with* his strengths

- **Index once per project** for meaning-based search:
  `index this project` → then `find the code that handles breeding logic`.
- **One task at a time.** He's better at "do X" than "do X, Y, and Z and refactor everything."
- **Point him at files.** If you know it's in `web/`, say so — saves a flailing search.
- **Big change?** Say `make a plan first, don't edit yet` — he explores and lays it out
  for approval before touching anything.
- **Delegate exploration:** `use a sub-agent to map how api.py talks to modules/`
  keeps his main context clean.
- **Verify-as-you-go:** add `then run the tests` / `then typecheck` so he self-corrects.

---

## Finding code: which tool, when

- **Exact string / symbol** → he uses `Grep` ("find every call to `breed()`").
- **By meaning, don't know the name** → `SemanticSearch` ("where breeding probabilities
  are computed"). Needs an index first: `index this project`.
- **Up-to-date docs / unfamiliar error** → `WebSearch` + `WebFetch` (offline-aware —
  if you're offline he just continues with local files).

---

## Modes & commands

| Command | What it does |
|---|---|
| `/auto` | Auto-approve safe ops (faster; otherwise he asks before each edit) |
| `/gpu` | GPU + Ollama status |
| `/mcp` | List MCP servers |
| `/mcp add <name> <cmd> [args...]` | Plug in an MCP server, e.g. `/mcp add fs npx -y @modelcontextprotocol/server-filesystem .` |
| `/mcp remove <name>` | Remove a server |
| `/help` | Full command list |
| `rodeo --new <name>` | Start a fresh session |

---

## Quick recipes

```
# Reorganize a messy root
move the loose .py files in the root into modules/, fix all imports,
then run `python -c "import api"` to verify nothing broke

# Targeted refactor
refactor web/ rendering: extract the repeated table-building code in
render_team() into a helper, no behavior change, then show me the diff

# Read-only audit
audit api.py — list every endpoint, what it does, and flag anything
unused or duplicated. Don't edit, just report.

# Plan before a big change
make a plan to split modules/ into data/ and logic/ — explore first,
show me the plan, don't move anything yet

# Semantic search
index this project
then: find where breeding probabilities are calculated
```

---

**TL;DR:** give him a **verb**, a **place**, and a **finish line** — one task at a time.
That's the difference between him cleaning your codebase and him grepping for OAuth. 🐎
