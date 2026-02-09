/**
 * Save Generated Component - Writes Figma-generated code to files
 *
 * POST /api/figma/save - Save component files
 */

import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

export const runtime = "nodejs";

interface SaveRequest {
  files: Array<{
    filename: string;
    content: string;
    directory?: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const body: SaveRequest = await req.json();

    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    // Default to src/components directory
    const baseDir = process.cwd();
    const savedFiles: string[] = [];

    for (const file of body.files) {
      const directory = file.directory || "src/components/generated";
      const filePath = join(baseDir, directory, file.filename);
      const dirPath = dirname(filePath);

      // Validate filename (prevent directory traversal)
      if (file.filename.includes("..") || file.filename.startsWith("/")) {
        return Response.json(
          { error: `Invalid filename: ${file.filename}` },
          { status: 400 }
        );
      }

      // Create directory if it doesn't exist
      if (!existsSync(dirPath)) {
        await mkdir(dirPath, { recursive: true });
      }

      // Write file
      await writeFile(filePath, file.content, "utf-8");
      savedFiles.push(filePath.replace(baseDir, ""));
    }

    return Response.json({
      success: true,
      files: savedFiles,
      message: `Saved ${savedFiles.length} file(s)`,
    });
  } catch (error: any) {
    console.error("Save error:", error);
    return Response.json(
      { error: error.message || "Failed to save files" },
      { status: 500 }
    );
  }
}
