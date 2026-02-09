import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { getProvider } from "@/lib/llm-client";
import { getModelsForApi, getRecommendedModel } from "@/lib/models";
import { hasMoonshot } from "@/lib/config";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getProvider();
  const includeMoonshot = hasMoonshot();
  const models = getModelsForApi(includeMoonshot);
  const recommended = getRecommendedModel(provider);

  return Response.json({
    object: "list",
    provider,
    data: models,
    recommended,
  });
}
