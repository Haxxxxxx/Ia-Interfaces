// Simple in-memory rate limiter
// For production, consider Redis

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const limits: Map<string, RateLimitEntry> = new Map();

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 RPM default
};

export function checkRateLimit(
  userId: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; remaining: number; resetIn: number } {
  const key = `ratelimit:${userId}`;
  const now = Date.now();

  let entry = limits.get(key);

  // Reset if window expired
  if (!entry || now > entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
  }

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetIn = Math.max(0, entry.resetAt - now);

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetIn };
  }

  // Increment counter
  entry.count++;
  limits.set(key, entry);

  return { allowed: true, remaining: remaining - 1, resetIn };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limits.entries()) {
    if (now > entry.resetAt) {
      limits.delete(key);
    }
  }
}, 60 * 1000); // Every minute

// Per-model rate limits (higher tier = more requests)
export const MODEL_RATE_LIMITS: Record<string, RateLimitConfig> = {
  "kimi-k2.5": { windowMs: 60000, maxRequests: 60 },
  "kimi-k2-0905": { windowMs: 60000, maxRequests: 100 },
  "kimi-k2-thinking": { windowMs: 60000, maxRequests: 30 },
  "kimi-k2-thinking-turbo": { windowMs: 60000, maxRequests: 20 },
};

export function getRateLimitForModel(model: string): RateLimitConfig {
  return MODEL_RATE_LIMITS[model] || DEFAULT_CONFIG;
}
