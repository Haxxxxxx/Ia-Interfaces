import { NextRequest } from "next/server";
import { validateApiKey, checkBudget } from "@/lib/auth";

// GET /api/auth - Validate API key and get user info
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);

  if (!user) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const budget = await checkBudget(user.id);

  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    budget,
    authenticated: true,
  });
}

// POST /api/auth - Verify API key (for login flow)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKey } = body;

  if (!apiKey) {
    return Response.json({ error: "API key required" }, { status: 400 });
  }

  const user = await validateApiKey(apiKey);

  if (!user) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const budget = await checkBudget(user.id);

  return Response.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    budget,
  });
}
