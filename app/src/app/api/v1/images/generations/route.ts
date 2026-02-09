import { NextRequest, NextResponse } from "next/server";
import { getConfig, hasMoonshot } from "@/lib/config";
import { validateApiKey } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Image Generation API - OpenAI-compatible endpoint
 * POST /api/v1/images/generations
 *
 * Supports multiple providers:
 * - Moonshot/Kimi (if available and model supports it)
 * - Stable Diffusion via Ollama (if available)
 * - Fallback to placeholder for testing
 */

interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  n?: number;
  size?: "256x256" | "512x512" | "1024x1024";
  quality?: "standard" | "hd";
  style?: "natural" | "vivid";
  response_format?: "url" | "b64_json";
}

interface ImageGenerationResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

// Placeholder image generator for development/testing
async function generatePlaceholderImage(prompt: string, size: string): Promise<string> {
  // Use a placeholder service for dev
  const [width, height] = size.split("x").map(Number);
  const encodedPrompt = encodeURIComponent(prompt.slice(0, 50));
  return `https://placehold.co/${width}x${height}/1a1a2e/a855f7?text=${encodedPrompt}`;
}

// Try Stable Diffusion via Ollama if available
async function generateWithStableDiffusion(
  prompt: string,
  _size: string
): Promise<string | null> {
  const { ollamaUrl } = getConfig();
  const baseUrl = ollamaUrl.replace("/v1", "");

  try {
    // Check if SD model is available
    const modelsRes = await fetch(`${baseUrl}/api/tags`);
    if (!modelsRes.ok) return null;

    const modelsData = await modelsRes.json();
    const sdModel = modelsData.models?.find((m: any) =>
      m.name.includes("stable-diffusion") ||
      m.name.includes("sdxl") ||
      m.name.includes("sd3")
    );

    if (!sdModel) return null;

    // Generate image with SD
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: sdModel.name,
        prompt,
        stream: false,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    // Ollama returns base64 images in the images array for vision models
    if (data.images && data.images[0]) {
      return `data:image/png;base64,${data.images[0]}`;
    }

    return null;
  } catch (e) {
    console.error("SD generation failed:", e);
    return null;
  }
}

// Try Moonshot/Kimi image generation if available
async function generateWithMoonshot(
  prompt: string,
  size: string
): Promise<string | null> {
  if (!hasMoonshot()) return null;

  const { moonshotApiKey } = getConfig();

  try {
    // Moonshot image generation endpoint (if available)
    const res = await fetch("https://api.moonshot.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${moonshotApiKey}`,
      },
      body: JSON.stringify({
        model: "kimi-image",
        prompt,
        size,
        n: 1,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.data && data.data[0]) {
      return data.data[0].url || (data.data[0].b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null);
    }

    return null;
  } catch (e) {
    console.error("Moonshot image generation failed:", e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.slice(7);
    const keyData = await validateApiKey(apiKey);
    if (!keyData) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    // Rate limiting
    const rateLimit = await checkRateLimit(keyData.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    // Parse request
    const body: ImageGenerationRequest = await request.json();
    const {
      prompt,
      n = 1,
      size = "1024x1024",
      response_format = "url",
    } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid prompt" },
        { status: 400 }
      );
    }

    // Try providers in order of preference
    let imageUrl: string | null = null;
    let provider = "placeholder";

    // 1. Try Moonshot
    imageUrl = await generateWithMoonshot(prompt, size);
    if (imageUrl) {
      provider = "moonshot";
    }

    // 2. Try Stable Diffusion via Ollama
    if (!imageUrl) {
      imageUrl = await generateWithStableDiffusion(prompt, size);
      if (imageUrl) {
        provider = "stable-diffusion";
      }
    }

    // 3. Fallback to placeholder
    if (!imageUrl) {
      imageUrl = await generatePlaceholderImage(prompt, size);
      provider = "placeholder";
    }

    // Generate response
    const images: Array<{ url?: string; b64_json?: string; revised_prompt?: string }> = [];

    for (let i = 0; i < n; i++) {
      if (response_format === "b64_json" && imageUrl.startsWith("data:")) {
        // Extract base64 from data URL
        const b64 = imageUrl.split(",")[1];
        images.push({ b64_json: b64, revised_prompt: prompt });
      } else {
        images.push({ url: imageUrl, revised_prompt: prompt });
      }
    }

    const response: ImageGenerationResponse = {
      created: Math.floor(Date.now() / 1000),
      data: images,
    };

    // Add provider info in response headers for debugging
    return NextResponse.json(response, {
      headers: {
        "X-Image-Provider": provider,
      },
    });
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "Image generation failed", details: error.message },
      { status: 500 }
    );
  }
}

// GET to check capabilities
export async function GET() {
  const capabilities = {
    providers: [] as string[],
    sizes: ["256x256", "512x512", "1024x1024"],
    formats: ["url", "b64_json"],
  };

  // Check available providers
  if (hasMoonshot()) {
    capabilities.providers.push("moonshot");
  }

  // Check if Stable Diffusion is available via Ollama
  try {
    const { ollamaUrl } = getConfig();
    const baseUrl = ollamaUrl.replace("/v1", "");
    const res = await fetch(`${baseUrl}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      const hasSD = data.models?.some((m: any) =>
        m.name.includes("stable-diffusion") ||
        m.name.includes("sdxl") ||
        m.name.includes("sd3")
      );
      if (hasSD) {
        capabilities.providers.push("stable-diffusion");
      }
    }
  } catch {}

  // Always have placeholder fallback
  capabilities.providers.push("placeholder");

  return NextResponse.json({
    available: true,
    capabilities,
  });
}
