# Rodeo Mobile

A minimal chat app for talking to your offline brain (Rodeo) from your phone —
while the model runs on your **Mac at home**, reachable over **Tailscale**.

> ⚠️ **Scaffold.** This was written without a device to test on. It's a clean
> starting point — run it, then refine. Versions below may need aligning to your
> installed Expo SDK (see step 1).

## How it works
```
📱 phone (Expo Go)  ──Tailscale (encrypted)──►  🏠 Mac running `ollama serve`
        │                                              │
        └──── POST /api/chat (Ollama native) ──────────┘
```
No Next.js server, no API key, nothing exposed to the public internet — the
phone talks **directly to Ollama** on your Mac over the private Tailscale tunnel.
Works on any wifi (the tunnel is encrypted); needs the Mac on + you online
(so: your "connected" days, not fully-dark ones).

## Setup

### On the Mac (the server)
1. Make sure Ollama is running: `ollama serve` (and the model is pulled, e.g. `qwen2.5:14b`).
2. Allow LAN/tunnel access so it's not localhost-only:
   `OLLAMA_HOST=0.0.0.0:11434 ollama serve` (or set it in the Ollama app settings).
3. Install [Tailscale](https://tailscale.com) and sign in. Note the Mac's Tailscale IP (`tailscale ip -4`, looks like `100.x.y.z`).

### On the phone
1. Install Tailscale + sign in to the **same** tailnet. Install **Expo Go**.

### Run the app
```bash
cd mobile
npm install
npx expo install --fix   # aligns deps to your installed Expo SDK
npx expo start           # scan the QR with Expo Go
```
In the app, tap ⚙ and set:
- **Ollama URL:** `http://<mac-tailscale-ip>:11434`
- **Model:** `qwen2.5:14b` (or whatever you pulled)

Then chat. 🐎

## Notes / next steps
- Non-streaming for simplicity (RN streaming is finicky). Add streaming via
  Ollama's NDJSON `stream:true` later if you want token-by-token output.
- It's a pure chat client — no tools/file-editing (that's the CLI/desktop's job).
- For true offline (no signal at all), nothing reaches the Mac; that's the
  hardware ceiling discussed in the project notes.
