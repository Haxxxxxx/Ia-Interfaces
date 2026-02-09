# Rodeo VPS Setup Guide

## Prerequisites

- Ubuntu 22.04+ VPS with GPU (NVIDIA A100/H100 recommended)
- Docker with NVIDIA Container Toolkit
- Domain name (optional, for HTTPS)

## Quick Start

### 1. Install Docker & NVIDIA Runtime

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### 2. Clone Repository

```bash
git clone https://github.com/rodeo-ai/rodeo.git
cd rodeo
```

### 3. Configure Environment

```bash
cp .env.example .env
# Set OLLAMA_URL=http://ollama:11434/v1 for Docker internal network
# Set DEPLOYMENT_MODE=vps
```

### 4. Start Services

```bash
docker compose up -d
```

### 5. Pull Models (GPU)

```bash
# Light: 8GB VRAM
docker compose exec ollama ollama pull qwen2.5:7b

# Heavy: 48GB VRAM (A100)
docker compose exec ollama ollama pull qwen2.5:72b
docker compose exec ollama ollama pull llama3.3:70b
```

### 6. Create API Keys

```bash
docker compose exec llm-hub npx tsx scripts/seed-team.ts
```

## Local Dev → Remote GPU

To run the API locally but use Ollama on a remote VPS:

1. Expose Ollama on VPS (Cloudflare Tunnel or port forward)
2. Set `OLLAMA_URL=https://llm.yourdomain.com/v1` (or `http://vps-ip:11434/v1`)
3. Run `npm run server` locally

## Cloudflare Tunnel (Zero-Trust Access)

### 1. Install cloudflared

```bash
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared focal main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

### 3. Create Tunnel

```bash
cloudflared tunnel create rodeo
cloudflared tunnel route dns rodeo llm.yourdomain.com
```

### 4. Configure Tunnel

```yaml
# ~/.cloudflared/config.yml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: llm.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 5. Run as Service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
```

## GPU Requirements

| Model | VRAM | Use Case |
|-------|------|----------|
| Qwen 2.5 7B | 8GB | Fast code |
| Qwen 2.5 32B | 24GB | Better code |
| Qwen 2.5 72B | 48GB | Heavy code, reasoning |
| Llama 3.3 70B | 48GB | Heavy code, reasoning |
| LLaVA 13B | 16GB | Vision, images, video frames |
| LLaVA Llama 3 8B | 12GB | Lighter vision + code |

## Concurrency (Multiple Simultaneous Users)

Docker Compose sets `OLLAMA_NUM_PARALLEL=2` and `OLLAMA_MAX_QUEUE=64`:
- Up to 2 requests run in parallel per model
- Additional requests queue (FIFO)
- 503 when queue is full

## Monitoring

### Check Ollama Status
```bash
curl http://localhost:11434/api/version
```

### Check App Health
```bash
curl http://localhost:3000/api/health
```

### View Logs
```bash
docker compose logs -f
```

## Troubleshooting

### Model Not Found
```bash
ollama list  # Check available models
ollama pull qwen2.5:7b  # Pull if missing
```

### GPU Not Detected
```bash
nvidia-smi  # Check GPU status
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### Out of Memory
- Use smaller model (7B instead of 72B)
- Reduce context length in config
- Enable model quantization

## Security Checklist

- [ ] Change default API keys
- [ ] Enable HTTPS via Cloudflare Tunnel
- [ ] Set up firewall (allow only Cloudflare IPs)
- [ ] Regular security updates
- [ ] Monitor access logs
