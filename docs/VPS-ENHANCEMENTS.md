# VPS/Cloud Deployment Enhancements

## Overview

This document outlines enhancements needed to make Rodeo production-ready for VPS and cloud deployments. Current codebase has basic VPS support, but several areas need improvement for reliable cloud operation.

---

## 1. Auto-Discovery & Configuration

### Current State
- Manual configuration required via `.env`
- No automatic detection of deployment environment
- Hardcoded localhost assumptions in some places

### Enhancements Needed

#### 1.1 Environment Auto-Detection
**File:** `app/src/lib/config.ts`

```typescript
// Detect VPS/cloud environment automatically
function detectDeploymentEnvironment(): {
  isVps: boolean;
  isDocker: boolean;
  isCloud: boolean;
  provider?: "aws" | "gcp" | "azure" | "digitalocean" | "hetzner" | "unknown";
} {
  // Check for Docker
  if (fs.existsSync("/.dockerenv") || process.env.DOCKER === "1") {
    return { isVps: true, isDocker: true, isCloud: false };
  }
  
  // Check for cloud metadata services
  const cloudProviders = {
    aws: "http://169.254.169.254/latest/meta-data/",
    gcp: "http://metadata.google.internal/computeMetadata/v1/",
    azure: "http://169.254.169.254/metadata/instance",
    digitalocean: "http://169.254.169.254/metadata/v1/",
  };
  
  // Detect cloud provider (async check in startup)
  // ...
  
  return { isVps: true, isDocker: false, isCloud: true, provider: "unknown" };
}
```

#### 1.2 Smart Ollama URL Detection
**File:** `app/src/lib/config.ts`

```typescript
function getOllamaUrl(): string {
  // Priority:
  // 1. Explicit OLLAMA_URL env var
  // 2. Docker: http://ollama:11434/v1 (internal network)
  // 3. VPS: Try http://localhost:11434/v1, fallback to remote if configured
  // 4. Cloud: Check for remote Ollama instance
  
  const env = detectDeploymentEnvironment();
  
  if (process.env.OLLAMA_URL) {
    return normalizeOllamaUrl(process.env.OLLAMA_URL);
  }
  
  if (env.isDocker) {
    return "http://ollama:11434/v1";
  }
  
  if (env.isVps) {
    // Try local first, then check for remote
    const localUrl = "http://localhost:11434/v1";
    if (await checkOllamaReachable(localUrl)) {
      return localUrl;
    }
    
    // Check for remote Ollama (e.g., separate GPU server)
    const remoteUrl = process.env.REMOTE_OLLAMA_URL;
    if (remoteUrl) {
      return normalizeOllamaUrl(remoteUrl);
    }
  }
  
  return "http://localhost:11434/v1"; // Default fallback
}
```

#### 1.3 Configuration Validation on Startup
**File:** `app/src/lib/startup-validation.ts`

```typescript
export async function validateVpsConfiguration(): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  const config = getConfig();
  const env = detectDeploymentEnvironment();
  
  // VPS-specific checks
  if (env.isVps) {
    // Check Ollama connectivity
    if (!await checkOllamaReachable(config.ollamaUrl)) {
      errors.push(`Ollama unreachable at ${config.ollamaUrl}`);
      recommendations.push("Verify Ollama is running and OLLAMA_URL is correct");
    }
    
    // Check database path (should be persistent volume in Docker)
    if (env.isDocker && config.databaseUrl.startsWith("file:")) {
      const dbPath = config.databaseUrl.replace("file:", "");
      if (!dbPath.includes("/data") && !dbPath.includes("/var")) {
        warnings.push("Database should be in persistent volume (/data or /var)");
      }
    }
    
    // Check HTTPS/security
    if (!process.env.DOMAIN && !process.env.CLOUDFLARE_TUNNEL_TOKEN) {
      warnings.push("No HTTPS configured - consider Cloudflare Tunnel or reverse proxy");
      recommendations.push("Set up Cloudflare Tunnel for secure access");
    }
    
    // Check API keys for production
    if (process.env.NODE_ENV === "production") {
      if (config.moonshotApiKey && config.moonshotApiKey.length < 20) {
        warnings.push("Moonshot API key appears invalid");
      }
      if (config.deepseekApiKey && config.deepseekApiKey.length < 20) {
        warnings.push("DeepSeek API key appears invalid");
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    recommendations,
  };
}
```

---

## 2. Network Resilience & Retry Logic

### Current State
- Basic retry logic in `fetchWithRetry` (CLI only)
- No exponential backoff
- No circuit breaker pattern
- Timeouts may be too short for remote connections

### Enhancements Needed

#### 2.1 Enhanced Retry Logic with Exponential Backoff
**File:** `app/src/lib/network-utils.ts` (new)

```typescript
interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
  timeout?: number;
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    retryableStatuses = [408, 429, 500, 502, 503, 504],
    timeout = 30000,
  } = retryOptions;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Success or non-retryable error
      if (response.ok || !retryableStatuses.includes(response.status)) {
        return response;
      }
      
      // Retryable error - wait and retry
      if (attempt < maxRetries) {
        const delay = Math.min(
          baseDelayMs * Math.pow(backoffMultiplier, attempt),
          maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response; // Last attempt, return anyway
    } catch (error: any) {
      lastError = error;
      
      // Network errors are retryable
      if (attempt < maxRetries && (error.name === "AbortError" || error.message.includes("fetch"))) {
        const delay = Math.min(
          baseDelayMs * Math.pow(backoffMultiplier, attempt),
          maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error("Max retries exceeded");
}
```

#### 2.2 Circuit Breaker Pattern
**File:** `app/src/lib/circuit-breaker.ts` (new)

```typescript
interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  failures: number;
  lastFailureTime: number;
  successCount: number;
}

class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: "closed",
    failures: 0,
    lastFailureTime: 0,
    successCount: 0,
  };
  
  private readonly failureThreshold = 5;
  private readonly resetTimeout = 60000; // 1 minute
  private readonly halfOpenSuccessThreshold = 2;
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.state === "open") {
      if (Date.now() - this.state.lastFailureTime > this.resetTimeout) {
        this.state.state = "half-open";
        this.state.successCount = 0;
      } else {
        throw new Error("Circuit breaker is OPEN - service unavailable");
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    if (this.state.state === "half-open") {
      this.state.successCount++;
      if (this.state.successCount >= this.halfOpenSuccessThreshold) {
        this.state.state = "closed";
        this.state.failures = 0;
      }
    } else {
      this.state.failures = 0;
    }
  }
  
  private onFailure() {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.failures >= this.failureThreshold) {
      this.state.state = "open";
    }
  }
}

// Global circuit breakers per service
export const ollamaCircuitBreaker = new CircuitBreaker();
export const moonshotCircuitBreaker = new CircuitBreaker();
export const deepseekCircuitBreaker = new CircuitBreaker();
```

#### 2.3 Connection Pooling for Ollama
**File:** `app/src/lib/llm-client.ts`

```typescript
// Use HTTP keep-alive for better performance
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";

const httpAgent = new HttpAgent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
});

const httpsAgent = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
});

function getAgent(url: string): HttpAgent | HttpsAgent {
  return url.startsWith("https") ? httpsAgent : httpAgent;
}

// Use agent in fetch calls
const response = await fetch(url, {
  agent: getAgent(url),
  // ... other options
});
```

---

## 3. Security Enhancements

### Current State
- Basic API key authentication
- No rate limiting per IP
- No CORS configuration for VPS
- No request signing/verification

### Enhancements Needed

#### 3.1 IP-Based Rate Limiting
**File:** `app/src/lib/rate-limit.ts`

```typescript
import { LRUCache } from "lru-cache";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipRateLimitCache = new LRUCache<string, RateLimitEntry>({
  max: 10000,
  ttl: 60000, // 1 minute
});

export function checkIpRateLimit(
  ip: string,
  limit: number = 60, // requests per minute
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetIn: number } {
  const key = `ip:${ip}`;
  const now = Date.now();
  const entry = ipRateLimitCache.get(key);
  
  if (!entry || now > entry.resetAt) {
    ipRateLimitCache.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true, remaining: limit - 1, resetIn: windowMs };
  }
  
  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetAt - now,
    };
  }
  
  entry.count++;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetIn: entry.resetAt - now,
  };
}
```

#### 3.2 CORS Configuration for VPS
**File:** `app/src/middleware.ts` (new or update)

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // VPS/cloud: Configure CORS
  const isVps = process.env.DEPLOYMENT_MODE === "vps" || process.env.DEPLOYMENT_MODE === "docker";
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
  const origin = request.headers.get("origin");
  
  if (isVps && origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  
  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
```

#### 3.3 Request Signing for CLI (Optional)
**File:** `cli/rodeo.ts` & `app/src/lib/auth.ts`

```typescript
// CLI: Sign requests with timestamp + HMAC
function signRequest(apiKey: string, method: string, path: string, body: string): string {
  const timestamp = Date.now();
  const message = `${method}\n${path}\n${timestamp}\n${body}`;
  const signature = crypto.createHmac("sha256", apiKey).update(message).digest("hex");
  return `${timestamp}:${signature}`;
}

// Server: Verify signature
export function verifyRequestSignature(
  signature: string,
  apiKey: string,
  method: string,
  path: string,
  body: string
): boolean {
  const [timestamp, receivedSig] = signature.split(":");
  const message = `${method}\n${path}\n${timestamp}\n${body}`;
  const expectedSig = crypto.createHmac("sha256", apiKey).update(message).digest("hex");
  
  // Check timestamp (prevent replay attacks - 5 min window)
  const age = Date.now() - parseInt(timestamp);
  if (age > 300000 || age < 0) return false;
  
  return crypto.timingSafeEqual(
    Buffer.from(receivedSig),
    Buffer.from(expectedSig)
  );
}
```

---

## 4. Monitoring & Observability

### Current State
- Basic health endpoint
- No metrics collection
- No alerting
- Limited logging

### Enhancements Needed

#### 4.1 Metrics Collection
**File:** `app/src/lib/metrics.ts` (new)

```typescript
interface Metrics {
  requests: {
    total: number;
    byEndpoint: Record<string, number>;
    byStatus: Record<number, number>;
  };
  llm: {
    calls: number;
    tokens: { input: number; output: number };
    latency: { p50: number; p95: number; p99: number };
    errors: number;
  };
  system: {
    memory: { used: number; total: number };
    cpu: number;
    uptime: number;
  };
}

class MetricsCollector {
  private metrics: Metrics = {
    requests: { total: 0, byEndpoint: {}, byStatus: {} },
    llm: { calls: 0, tokens: { input: 0, output: 0 }, latency: { p50: 0, p95: 0, p99: 0 }, errors: 0 },
    system: { memory: { used: 0, total: 0 }, cpu: 0, uptime: 0 },
  };
  
  recordRequest(endpoint: string, status: number, latency: number) {
    this.metrics.requests.total++;
    this.metrics.requests.byEndpoint[endpoint] = (this.metrics.requests.byEndpoint[endpoint] || 0) + 1;
    this.metrics.requests.byStatus[status] = (this.metrics.requests.byStatus[status] || 0) + 1;
  }
  
  recordLlmCall(tokens: { input: number; output: number }, latency: number) {
    this.metrics.llm.calls++;
    this.metrics.llm.tokens.input += tokens.input;
    this.metrics.llm.tokens.output += tokens.output;
    // Update latency percentiles...
  }
  
  getMetrics(): Metrics {
    // Update system metrics
    this.metrics.system.memory = process.memoryUsage();
    this.metrics.system.uptime = process.uptime();
    
    return { ...this.metrics };
  }
}

export const metrics = new MetricsCollector();
```

#### 4.2 Enhanced Health Endpoint
**File:** `app/src/app/api/health/route.ts`

```typescript
export async function GET() {
  const config = getConfig();
  const backends = await healthCheckDetailed();
  const metrics = getMetrics();
  
  // VPS-specific health checks
  const vpsChecks = {
    diskSpace: await checkDiskSpace(),
    gpuAvailable: await checkGpuAvailability(),
    ollamaModels: await getOllamaModelCount(),
    activeConnections: metrics.requests.total,
  };
  
  return Response.json({
    status: determineOverallStatus(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    deployment: {
      mode: config.deploymentMode,
      environment: process.env.NODE_ENV,
      region: process.env.AWS_REGION || process.env.GCP_REGION || "unknown",
    },
    services: {
      api: "ok",
      ollama: backends.ollama,
      moonshot: backends.moonshot,
      deepseek: backends.deepseek,
    },
    vps: vpsChecks,
    metrics: {
      requests: metrics.requests.total,
      llmCalls: metrics.llm.calls,
      uptime: process.uptime(),
    },
  });
}
```

#### 4.3 Structured Logging
**File:** `app/src/lib/logger.ts` (new)

```typescript
interface LogEntry {
  level: "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  log(level: LogEntry["level"], message: string, context?: Record<string, any>, error?: Error) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        deploymentMode: process.env.DEPLOYMENT_MODE,
        environment: process.env.NODE_ENV,
      },
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };
    
    // In production, send to logging service (e.g., CloudWatch, Datadog)
    if (process.env.NODE_ENV === "production") {
      // Send to external logging service
      sendToLoggingService(entry);
    } else {
      // Local development: console output
      console[level](JSON.stringify(entry, null, 2));
    }
  }
  
  info(message: string, context?: Record<string, any>) {
    this.log("info", message, context);
  }
  
  error(message: string, error?: Error, context?: Record<string, any>) {
    this.log("error", message, context, error);
  }
}

export const logger = new Logger();
```

---

## 5. Performance Optimizations

### Current State
- Basic caching
- No request queuing
- No connection pooling
- Synchronous model loading

### Enhancements Needed

#### 5.1 Request Queuing for Ollama
**File:** `app/src/lib/request-queue.ts` (new)

```typescript
interface QueuedRequest {
  id: string;
  priority: number;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = 0;
  private maxConcurrent: number;
  
  constructor(maxConcurrent: number = 2) {
    this.maxConcurrent = maxConcurrent;
  }
  
  async enqueue<T>(
    execute: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: crypto.randomUUID(),
        priority,
        execute,
        resolve,
        reject,
      });
      
      this.queue.sort((a, b) => b.priority - a.priority);
      this.process();
    });
  }
  
  private async process() {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    this.processing++;
    const request = this.queue.shift()!;
    
    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      request.reject(error as Error);
    } finally {
      this.processing--;
      this.process(); // Process next item
    }
  }
}

export const ollamaRequestQueue = new RequestQueue(2); // Max 2 concurrent
```

#### 5.2 Model Preloading & Warmup
**File:** `app/src/lib/model-warmup.ts` (new)

```typescript
export async function warmupModels() {
  const config = getConfig();
  const defaultModel = config.defaultModel;
  
  // Preload default model on startup (VPS only)
  if (config.deploymentMode === "vps" || config.deploymentMode === "docker") {
    try {
      logger.info("Warming up default model", { model: defaultModel });
      await fetch(`${config.ollamaUrl.replace("/v1", "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: defaultModel,
          prompt: "warmup",
          stream: false,
        }),
      });
      logger.info("Model warmup complete", { model: defaultModel });
    } catch (error) {
      logger.error("Model warmup failed", error as Error);
    }
  }
}
```

#### 5.3 Response Compression
**File:** `app/src/app/api/v1/chat/completions/route.ts`

```typescript
import { compress } from "compression";

export async function POST(req: NextRequest) {
  // ... existing code ...
  
  // For VPS: compress large responses
  const config = getConfig();
  if ((config.deploymentMode === "vps" || config.deploymentMode === "docker") && !stream) {
    const response = Response.json(data);
    // Add compression middleware
    return compressResponse(response);
  }
  
  return response;
}
```

---

## 6. Deployment Automation

### Current State
- Manual Docker Compose setup
- No automated provisioning
- No health checks in deployment

### Enhancements Needed

#### 6.1 Deployment Script
**File:** `scripts/deploy-vps.sh` (new)

```bash
#!/bin/bash
set -e

# VPS Deployment Script
# Usage: ./scripts/deploy-vps.sh [environment]

ENVIRONMENT=${1:-production}
DOMAIN=${DOMAIN:-""}
CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN:-""}

echo "🚀 Deploying Rodeo to VPS (${ENVIRONMENT})..."

# 1. Validate environment
if [ -z "$DOMAIN" ] && [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
  echo "⚠️  Warning: No domain or Cloudflare tunnel configured"
fi

# 2. Pull latest code
git pull origin main

# 3. Build Docker images
docker compose build

# 4. Run database migrations
docker compose run --rm llm-hub npm run db:push

# 5. Start services with health checks
docker compose up -d --wait

# 6. Verify deployment
echo "⏳ Waiting for services to be healthy..."
sleep 10

HEALTH=$(curl -s http://localhost:3000/api/health | jq -r '.status')
if [ "$HEALTH" != "healthy" ]; then
  echo "❌ Deployment failed - health check returned: $HEALTH"
  docker compose logs --tail=50
  exit 1
fi

echo "✅ Deployment successful!"
echo "🌐 API available at: http://localhost:3000"
if [ -n "$DOMAIN" ]; then
  echo "🌐 Public URL: https://${DOMAIN}"
fi
```

#### 6.2 Health Check Integration
**File:** `docker-compose.yml`

```yaml
services:
  llm-hub:
    # ... existing config ...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
```

#### 6.3 Auto-Scaling Configuration (Optional)
**File:** `docker-compose.scale.yml` (new)

```yaml
# For high-traffic VPS deployments
services:
  llm-hub:
    deploy:
      replicas: 2  # Run 2 instances behind load balancer
      resources:
        limits:
          cpus: "2"
          memory: 1G
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
```

---

## 7. CLI Enhancements for Remote Access

### Current State
- CLI assumes localhost
- No automatic remote URL detection
- Manual configuration required

### Enhancements Needed

#### 7.1 Auto-Discover Remote API
**File:** `cli/rodeo.ts`

```typescript
async function discoverRemoteApi(): Promise<string | null> {
  // Check common VPS URLs
  const commonUrls = [
    process.env.RODEO_API_URL,
    "https://llm.yourdomain.com",
    "https://rodeo.yourdomain.com",
    // Check DNS for rodeo.* subdomain
  ];
  
  for (const url of commonUrls.filter(Boolean)) {
    try {
      const res = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        return url;
      }
    } catch {}
  }
  
  return null;
}
```

#### 7.2 Better Error Messages for Remote
**File:** `cli/rodeo.ts`

```typescript
async function checkApiConnectivity(): Promise<boolean> {
  try {
    const res = await fetch(`${CONFIG.apiUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        console.log(`\n${c.yellow}⚠ Authentication failed${c.reset}`);
        console.log(`${c.dim}Check your API key: ${c.cyan}rodeo --init${c.reset}\n`);
      } else {
        console.log(`\n${c.yellow}⚠ API returned ${res.status}${c.reset}`);
      }
      return false;
    }
    
    return true;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.log(`\n${c.red}✗ API timeout${c.reset} - Server at ${CONFIG.apiUrl} not responding`);
    } else {
      console.log(`\n${c.red}✗ Cannot connect to API${c.reset} - ${error.message}`);
    }
    
    // Suggest remote discovery
    if (!CONFIG.apiUrl.includes("localhost")) {
      console.log(`${c.dim}Tip: Run ${c.cyan}rodeo --discover${c.reset} to find remote API${c.reset}\n`);
    }
    
    return false;
  }
}
```

---

## 8. Configuration Management

### Current State
- `.env` file required
- No validation
- No defaults for VPS

### Enhancements Needed

#### 8.1 Configuration Wizard
**File:** `scripts/setup-vps.sh` (new)

```bash
#!/bin/bash
# Interactive VPS setup wizard

echo "🎯 Rodeo VPS Setup Wizard"
echo ""

# Detect environment
if [ -f "/.dockerenv" ]; then
  DEPLOYMENT_MODE="docker"
elif [ -n "$AWS_REGION" ] || [ -n "$GCP_REGION" ]; then
  DEPLOYMENT_MODE="vps"
else
  DEPLOYMENT_MODE="local"
fi

# Ask questions
read -p "Domain name (optional): " DOMAIN
read -p "Cloudflare Tunnel Token (optional): " TUNNEL_TOKEN
read -p "Ollama URL [http://localhost:11434/v1]: " OLLAMA_URL
OLLAMA_URL=${OLLAMA_URL:-"http://localhost:11434/v1"}

# Generate .env
cat > .env << EOF
DEPLOYMENT_MODE=${DEPLOYMENT_MODE}
DOMAIN=${DOMAIN}
CLOUDFLARE_TUNNEL_TOKEN=${TUNNEL_TOKEN}
OLLAMA_URL=${OLLAMA_URL}
NODE_ENV=production
DATABASE_URL=file:/data/llmhub.db
EOF

echo "✅ Configuration saved to .env"
```

#### 8.2 Environment-Specific Defaults
**File:** `app/src/lib/config.ts`

```typescript
function getDefaultConfig(): Partial<AppConfig> {
  const deploymentMode = parseDeploymentMode();
  
  const defaults: Record<DeploymentMode, Partial<AppConfig>> = {
    local: {
      ollamaUrl: "http://localhost:11434/v1",
      databaseUrl: "file:./llmhub.db",
    },
    docker: {
      ollamaUrl: "http://ollama:11434/v1",
      databaseUrl: "file:/data/llmhub.db",
    },
    vps: {
      ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434/v1",
      databaseUrl: process.env.DATABASE_URL || "file:/var/lib/rodeo/llmhub.db",
    },
  };
  
  return defaults[deploymentMode] || defaults.local;
}
```

---

## 9. Multi-Region Support (Future)

### Enhancements Needed

#### 9.1 Region Detection
```typescript
async function detectRegion(): Promise<string> {
  // AWS
  try {
    const res = await fetch("http://169.254.169.254/latest/meta-data/placement/region", {
      signal: AbortSignal.timeout(1000),
    });
    return await res.text();
  } catch {}
  
  // GCP
  try {
    const res = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/zone", {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(1000),
    });
    const zone = await res.text();
    return zone.split("/")[3]; // Extract region from zone
  } catch {}
  
  return "unknown";
}
```

#### 9.2 Region-Aware Model Selection
```typescript
// Prefer models available in current region
function getRegionalModels(region: string): string[] {
  const regionalModels: Record<string, string[]> = {
    "us-east-1": ["qwen2.5:7b", "qwen2.5:32b"],
    "eu-west-1": ["qwen2.5:7b"],
    // ...
  };
  
  return regionalModels[region] || ["qwen2.5:7b"];
}
```

---

## 10. Testing & Validation

### Enhancements Needed

#### 10.1 VPS Deployment Test Suite
**File:** `scripts/test-vps-deployment.sh` (new)

```bash
#!/bin/bash
# Test VPS deployment health

echo "🧪 Testing VPS Deployment..."

# Test 1: Health endpoint
echo "1. Testing health endpoint..."
HEALTH=$(curl -s http://localhost:3000/api/health)
if echo "$HEALTH" | jq -e '.status == "healthy"' > /dev/null; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  exit 1
fi

# Test 2: Ollama connectivity
echo "2. Testing Ollama connectivity..."
OLLAMA_STATUS=$(echo "$HEALTH" | jq -r '.backends.ollama')
if [ "$OLLAMA_STATUS" == "ok" ]; then
  echo "✅ Ollama connected"
else
  echo "⚠️  Ollama not connected"
fi

# Test 3: API authentication
echo "3. Testing API authentication..."
# ... test with API key

# Test 4: Model availability
echo "4. Testing model availability..."
MODELS=$(curl -s http://localhost:3000/api/models | jq -r '.data[] | select(.installed == true) | .id')
if [ -n "$MODELS" ]; then
  echo "✅ Models available: $MODELS"
else
  echo "⚠️  No models installed"
fi

echo "✅ All tests passed!"
```

---

## Implementation Priority

### Phase 1: Critical (Immediate)
1. ✅ Auto-discovery of deployment environment
2. ✅ Enhanced error handling for remote connections
3. ✅ Configuration validation
4. ✅ Better health checks

### Phase 2: Important (Next Sprint)
5. ✅ Network resilience (retry logic, circuit breaker)
6. ✅ Security enhancements (IP rate limiting, CORS)
7. ✅ Monitoring & metrics
8. ✅ Deployment automation scripts

### Phase 3: Nice to Have (Future)
9. ✅ Performance optimizations (queuing, preloading)
10. ✅ Multi-region support
11. ✅ Advanced monitoring/alerting

---

## Files to Create/Modify

### New Files
- `app/src/lib/network-utils.ts` - Retry logic, circuit breaker
- `app/src/lib/circuit-breaker.ts` - Circuit breaker implementation
- `app/src/lib/metrics.ts` - Metrics collection
- `app/src/lib/logger.ts` - Structured logging
- `app/src/lib/request-queue.ts` - Request queuing
- `app/src/lib/model-warmup.ts` - Model preloading
- `app/src/middleware.ts` - CORS & security headers
- `scripts/deploy-vps.sh` - Deployment automation
- `scripts/setup-vps.sh` - Setup wizard
- `scripts/test-vps-deployment.sh` - Test suite

### Modified Files
- `app/src/lib/config.ts` - Auto-detection, smart defaults
- `app/src/lib/startup-validation.ts` - VPS-specific validation
- `app/src/app/api/health/route.ts` - Enhanced health checks
- `app/src/lib/llm-client.ts` - Connection pooling, retry logic
- `cli/rodeo.ts` - Remote API discovery, better errors
- `docker-compose.yml` - Health checks, restart policies

---

## Testing Checklist

- [ ] VPS deployment succeeds with minimal configuration
- [ ] Auto-detection works for Docker/VPS/cloud
- [ ] Remote Ollama connection works reliably
- [ ] Health checks report accurate status
- [ ] Retry logic handles network failures
- [ ] Rate limiting prevents abuse
- [ ] Metrics are collected correctly
- [ ] Logs are structured and searchable
- [ ] Deployment script works end-to-end
- [ ] CLI connects to remote API successfully

---

## Notes

- These enhancements focus on making Rodeo production-ready for VPS/cloud
- Many can be implemented incrementally
- Some features (multi-region, advanced monitoring) are future enhancements
- Priority should be on reliability and ease of deployment
