/**
 * Project memory - persistent context storage per project
 * Stores patterns, conventions, todos, and insights learned from conversations
 */

import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

/**
 * A stored solution - records what worked for a specific problem
 * Inspired by Agent Zero's solutions memory
 */
export interface Solution {
  id: string;
  problem: string;         // What was the user trying to do / fix
  context: string;         // File path, error message, or situation
  solution: string;        // What code/command solved it
  filePath?: string;       // Which file was modified
  language?: string;       // Programming language
  tags: string[];          // Keywords for matching (e.g., "typescript", "api", "error")
  successCount: number;    // How many times this solution was reused
  createdAt: Date;
  lastUsed: Date;
}

export interface ProjectMemory {
  id: string;
  instanceId: string;
  projectPath: string;
  patterns: string[];      // Code patterns detected (e.g., "API routes at /api/v1/*")
  conventions: string[];   // Coding conventions (e.g., "Use TypeScript strict mode")
  todos: string[];         // Pending tasks
  insights: string[];      // Key learnings from conversations
  techStack: string[];     // Detected technologies
  solutions: Solution[];   // Successful solutions for future reference
  createdAt: Date;
  lastAccessed: Date;
}

export interface MemoryUpdate {
  patterns?: string[];
  conventions?: string[];
  todos?: string[];
  insights?: string[];
  techStack?: string[];
}

// ============================================================================
// Storage
// ============================================================================

// In-memory cache for quick access
const memoryCache = new Map<string, ProjectMemory>();

// Persistence directory
const MEMORY_DIR = process.env.MEMORY_PATH || "/tmp/rodeo/memory";

function getMemoryKey(instanceId: string, projectPath: string): string {
  // Create a unique key based on instance and project
  const normalized = projectPath.replace(/[^a-zA-Z0-9]/g, "_");
  return `${instanceId}_${normalized}`;
}

function getMemoryFilePath(key: string): string {
  return path.join(MEMORY_DIR, `${key}.json`);
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get project memory, creating if it doesn't exist
 */
export async function getProjectMemory(
  instanceId: string,
  projectPath: string
): Promise<ProjectMemory | null> {
  const key = getMemoryKey(instanceId, projectPath);

  // Check cache first
  if (memoryCache.has(key)) {
    const memory = memoryCache.get(key)!;
    memory.lastAccessed = new Date();
    return memory;
  }

  // Try to load from disk
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const filePath = getMemoryFilePath(key);
    const content = await fs.readFile(filePath, "utf-8");
    const memory = JSON.parse(content) as ProjectMemory;
    memory.lastAccessed = new Date();
    memory.createdAt = new Date(memory.createdAt);
    memoryCache.set(key, memory);
    return memory;
  } catch {
    // No memory exists yet
    return null;
  }
}

/**
 * Get or create project memory
 */
export async function getOrCreateProjectMemory(
  instanceId: string,
  projectPath: string
): Promise<ProjectMemory> {
  const existing = await getProjectMemory(instanceId, projectPath);
  if (existing) return existing;

  const key = getMemoryKey(instanceId, projectPath);
  const memory: ProjectMemory = {
    id: key,
    instanceId,
    projectPath,
    patterns: [],
    conventions: [],
    todos: [],
    insights: [],
    techStack: [],
    solutions: [],
    createdAt: new Date(),
    lastAccessed: new Date(),
  };

  memoryCache.set(key, memory);
  await saveMemory(memory);

  return memory;
}

/**
 * Save memory to disk
 */
async function saveMemory(memory: ProjectMemory): Promise<void> {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const key = getMemoryKey(memory.instanceId, memory.projectPath);
    const filePath = getMemoryFilePath(key);
    await fs.writeFile(filePath, JSON.stringify(memory, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save project memory:", err);
  }
}

/**
 * Update project memory with new items
 */
export async function updateProjectMemory(
  instanceId: string,
  projectPath: string,
  update: MemoryUpdate
): Promise<ProjectMemory> {
  const memory = await getOrCreateProjectMemory(instanceId, projectPath);

  // Add new items (avoid duplicates)
  if (update.patterns) {
    for (const pattern of update.patterns) {
      if (!memory.patterns.includes(pattern)) {
        memory.patterns.push(pattern);
      }
    }
  }

  if (update.conventions) {
    for (const convention of update.conventions) {
      if (!memory.conventions.includes(convention)) {
        memory.conventions.push(convention);
      }
    }
  }

  if (update.todos) {
    for (const todo of update.todos) {
      if (!memory.todos.includes(todo)) {
        memory.todos.push(todo);
      }
    }
  }

  if (update.insights) {
    for (const insight of update.insights) {
      if (!memory.insights.includes(insight)) {
        memory.insights.push(insight);
      }
    }
  }

  if (update.techStack) {
    for (const tech of update.techStack) {
      if (!memory.techStack.includes(tech)) {
        memory.techStack.push(tech);
      }
    }
  }

  memory.lastAccessed = new Date();
  await saveMemory(memory);

  return memory;
}

/**
 * Add a single insight to project memory (for /remember command)
 */
export async function addInsight(
  instanceId: string,
  projectPath: string,
  insight: string
): Promise<ProjectMemory> {
  return updateProjectMemory(instanceId, projectPath, {
    insights: [insight],
  });
}

/**
 * Remove an item from memory by index
 */
export async function removeFromMemory(
  instanceId: string,
  projectPath: string,
  type: "patterns" | "conventions" | "todos" | "insights" | "techStack",
  index: number
): Promise<{ success: boolean; removed?: string; error?: string }> {
  const memory = await getProjectMemory(instanceId, projectPath);
  if (!memory) {
    return { success: false, error: "No memory found for this project" };
  }

  const array = memory[type];
  if (index < 0 || index >= array.length) {
    return { success: false, error: `Invalid index: ${index}. Valid range: 0-${array.length - 1}` };
  }

  const removed = array.splice(index, 1)[0];
  await saveMemory(memory);

  return { success: true, removed };
}

/**
 * Mark a todo as complete (remove it)
 */
export async function completeTodo(
  instanceId: string,
  projectPath: string,
  index: number
): Promise<{ success: boolean; completed?: string; error?: string }> {
  const result = await removeFromMemory(instanceId, projectPath, "todos", index);
  return {
    success: result.success,
    completed: result.removed,
    error: result.error,
  };
}

/**
 * Clear all memory for a project
 */
export async function clearProjectMemory(
  instanceId: string,
  projectPath: string
): Promise<void> {
  const key = getMemoryKey(instanceId, projectPath);
  memoryCache.delete(key);

  try {
    const filePath = getMemoryFilePath(key);
    await fs.unlink(filePath);
  } catch {
    // File doesn't exist
  }
}

// ============================================================================
// Solutions Storage - Remember what worked
// ============================================================================

/**
 * Generate a unique ID for a solution
 */
function generateSolutionId(): string {
  return `sol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract tags from problem/solution text for matching
 */
function extractTags(text: string, filePath?: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();

  // Language detection from file extension
  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      ".ts": "typescript", ".tsx": "typescript", ".js": "javascript",
      ".jsx": "javascript", ".py": "python", ".rs": "rust",
      ".go": "go", ".rb": "ruby", ".java": "java", ".cpp": "cpp",
      ".c": "c", ".css": "css", ".html": "html", ".json": "json",
    };
    if (langMap[ext]) tags.push(langMap[ext]);
  }

  // Common patterns
  const patterns = [
    { match: /error|fix|bug|issue/, tag: "bugfix" },
    { match: /import|export|module/, tag: "imports" },
    { match: /api|endpoint|route|fetch/, tag: "api" },
    { match: /database|db|query|sql/, tag: "database" },
    { match: /auth|login|password|token/, tag: "auth" },
    { match: /test|spec|jest|vitest/, tag: "testing" },
    { match: /style|css|tailwind|color/, tag: "styling" },
    { match: /component|react|vue|svelte/, tag: "component" },
    { match: /config|env|setting/, tag: "config" },
    { match: /type|interface|generic/, tag: "types" },
    { match: /async|await|promise|callback/, tag: "async" },
    { match: /lint|eslint|prettier/, tag: "linting" },
    { match: /build|compile|bundle/, tag: "build" },
    { match: /deploy|docker|ci|cd/, tag: "deployment" },
  ];

  for (const { match, tag } of patterns) {
    if (match.test(lower) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Calculate similarity score between two tag sets (0-1)
 */
function calculateTagSimilarity(tags1: string[], tags2: string[]): number {
  if (tags1.length === 0 || tags2.length === 0) return 0;

  const set1 = new Set(tags1);
  const set2 = new Set(tags2);
  const intersection = Array.from(set1).filter(t => set2.has(t));
  const union = new Set(tags1.concat(tags2));

  return intersection.length / union.size; // Jaccard similarity
}

/**
 * Simple text similarity using word overlap
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = Array.from(words1).filter(w => words2.has(w));
  const union = new Set(Array.from(words1).concat(Array.from(words2)));

  return intersection.length / union.size;
}

/**
 * Store a successful solution
 */
export async function storeSolution(
  instanceId: string,
  projectPath: string,
  problem: string,
  solution: string,
  context?: string,
  filePath?: string
): Promise<Solution> {
  const memory = await getOrCreateProjectMemory(instanceId, projectPath);

  // Ensure solutions array exists (for backward compatibility)
  if (!memory.solutions) {
    memory.solutions = [];
  }

  // Extract language from file path
  let language: string | undefined;
  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript",
      ".jsx": "JavaScript", ".py": "Python", ".rs": "Rust",
      ".go": "Go", ".rb": "Ruby", ".java": "Java",
    };
    language = langMap[ext];
  }

  // Generate tags for matching
  const tags = extractTags(`${problem} ${solution} ${context || ""}`, filePath);

  // Check if a similar solution already exists
  const existing = memory.solutions.find(s =>
    calculateTextSimilarity(s.problem, problem) > 0.7 &&
    calculateTextSimilarity(s.solution, solution) > 0.8
  );

  if (existing) {
    // Update existing solution
    existing.successCount++;
    existing.lastUsed = new Date();
    // Merge tags
    for (const tag of tags) {
      if (!existing.tags.includes(tag)) {
        existing.tags.push(tag);
      }
    }
    await saveMemory(memory);
    return existing;
  }

  // Create new solution
  const newSolution: Solution = {
    id: generateSolutionId(),
    problem,
    context: context || "",
    solution,
    filePath,
    language,
    tags,
    successCount: 1,
    createdAt: new Date(),
    lastUsed: new Date(),
  };

  // Keep solutions manageable (max 100 per project)
  if (memory.solutions.length >= 100) {
    // Remove oldest, least-used solution
    memory.solutions.sort((a, b) => {
      const scoreA = a.successCount + (Date.now() - new Date(a.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
      const scoreB = b.successCount + (Date.now() - new Date(b.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
      return scoreB - scoreA;
    });
    memory.solutions.pop();
  }

  memory.solutions.push(newSolution);
  await saveMemory(memory);

  return newSolution;
}

/**
 * Find relevant solutions for a given problem
 */
export async function findSolutions(
  instanceId: string,
  projectPath: string,
  query: string,
  limit: number = 3
): Promise<Solution[]> {
  const memory = await getProjectMemory(instanceId, projectPath);
  if (!memory || !memory.solutions || memory.solutions.length === 0) {
    return [];
  }

  const queryTags = extractTags(query);

  // Score each solution
  const scored = memory.solutions.map(solution => {
    const tagSim = calculateTagSimilarity(queryTags, solution.tags);
    const textSim = calculateTextSimilarity(query, `${solution.problem} ${solution.context}`);
    const usageBonus = Math.min(solution.successCount / 10, 0.2); // Max 20% bonus
    const recencyBonus = Math.max(0, 0.1 - (Date.now() - new Date(solution.lastUsed).getTime()) / (1000 * 60 * 60 * 24 * 30) * 0.1);

    const score = (tagSim * 0.4) + (textSim * 0.4) + usageBonus + recencyBonus;

    return { solution, score };
  });

  // Sort by score and return top matches
  scored.sort((a, b) => b.score - a.score);

  // Only return solutions with reasonable relevance
  return scored
    .filter(s => s.score > 0.15)
    .slice(0, limit)
    .map(s => s.solution);
}

/**
 * Mark a solution as used (increment success count)
 */
export async function markSolutionUsed(
  instanceId: string,
  projectPath: string,
  solutionId: string
): Promise<void> {
  const memory = await getProjectMemory(instanceId, projectPath);
  if (!memory || !memory.solutions) return;

  const solution = memory.solutions.find(s => s.id === solutionId);
  if (solution) {
    solution.successCount++;
    solution.lastUsed = new Date();
    await saveMemory(memory);
  }
}

/**
 * Format solutions for display
 */
export function formatSolutionsForDisplay(solutions: Solution[]): string {
  if (solutions.length === 0) {
    return "No relevant solutions found.";
  }

  const lines: string[] = ["## Relevant Solutions\n"];

  for (let i = 0; i < solutions.length; i++) {
    const s = solutions[i];
    lines.push(`### ${i + 1}. ${s.problem.slice(0, 60)}${s.problem.length > 60 ? "..." : ""}`);
    if (s.filePath) {
      lines.push(`**File:** \`${s.filePath}\``);
    }
    if (s.language) {
      lines.push(`**Language:** ${s.language}`);
    }
    lines.push(`**Used:** ${s.successCount} time${s.successCount > 1 ? "s" : ""}`);
    lines.push(`**Tags:** ${s.tags.join(", ")}`);
    lines.push("");
    lines.push("```");
    lines.push(s.solution.slice(0, 500) + (s.solution.length > 500 ? "\n..." : ""));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format solutions for inclusion in system prompt (compact)
 */
export function formatSolutionsForPrompt(solutions: Solution[]): string {
  if (solutions.length === 0) return "";

  const lines: string[] = ["\n[Relevant Past Solutions]"];

  for (const s of solutions) {
    lines.push(`- Problem: ${s.problem.slice(0, 100)}`);
    lines.push(`  Solution: ${s.solution.slice(0, 200)}${s.solution.length > 200 ? "..." : ""}`);
    if (s.filePath) {
      lines.push(`  File: ${s.filePath}`);
    }
  }

  lines.push("[End Solutions]");

  return lines.join("\n");
}

// ============================================================================
// Memory Formatting
// ============================================================================

/**
 * Format memory for inclusion in system prompt
 */
export function formatMemoryForPrompt(memory: ProjectMemory): string {
  const sections: string[] = [];

  sections.push("[Project Memory]");

  if (memory.techStack.length > 0) {
    sections.push(`Tech Stack: ${memory.techStack.join(", ")}`);
  }

  if (memory.conventions.length > 0) {
    sections.push(`Conventions: ${memory.conventions.join("; ")}`);
  }

  if (memory.patterns.length > 0) {
    sections.push(`Patterns: ${memory.patterns.join("; ")}`);
  }

  if (memory.insights.length > 0) {
    sections.push(`Insights: ${memory.insights.join("; ")}`);
  }

  if (memory.todos.length > 0) {
    sections.push(`Pending TODOs: ${memory.todos.join("; ")}`);
  }

  // Include top solutions (most used, most recent)
  if (memory.solutions && memory.solutions.length > 0) {
    const topSolutions = [...memory.solutions]
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, 3);

    sections.push("\n[Top Solutions]");
    for (const s of topSolutions) {
      sections.push(`- ${s.problem.slice(0, 80)}: ${s.solution.slice(0, 100)}${s.solution.length > 100 ? "..." : ""}`);
    }
  }

  sections.push("[End Memory]");

  return sections.join("\n");
}

/**
 * Format memory for display to user
 */
export function formatMemoryForDisplay(memory: ProjectMemory): string {
  const sections: string[] = [];

  sections.push("# Project Memory\n");

  if (memory.techStack.length > 0) {
    sections.push("## Tech Stack");
    memory.techStack.forEach((tech, i) => {
      sections.push(`${i}. ${tech}`);
    });
    sections.push("");
  }

  if (memory.conventions.length > 0) {
    sections.push("## Conventions");
    memory.conventions.forEach((conv, i) => {
      sections.push(`${i}. ${conv}`);
    });
    sections.push("");
  }

  if (memory.patterns.length > 0) {
    sections.push("## Patterns");
    memory.patterns.forEach((pattern, i) => {
      sections.push(`${i}. ${pattern}`);
    });
    sections.push("");
  }

  if (memory.insights.length > 0) {
    sections.push("## Insights");
    memory.insights.forEach((insight, i) => {
      sections.push(`${i}. ${insight}`);
    });
    sections.push("");
  }

  if (memory.todos.length > 0) {
    sections.push("## TODOs");
    memory.todos.forEach((todo, i) => {
      sections.push(`${i}. [ ] ${todo}`);
    });
    sections.push("");
  }

  if (memory.solutions && memory.solutions.length > 0) {
    sections.push("## Solutions (What Worked)");
    const sorted = [...memory.solutions].sort((a, b) => b.successCount - a.successCount);
    sorted.slice(0, 5).forEach((sol, i) => {
      sections.push(`${i}. **${sol.problem.slice(0, 50)}${sol.problem.length > 50 ? "..." : ""}**`);
      sections.push(`   Used ${sol.successCount}x | Tags: ${sol.tags.slice(0, 4).join(", ")}`);
      if (sol.filePath) {
        sections.push(`   File: \`${sol.filePath}\``);
      }
    });
    sections.push("");
    if (memory.solutions.length > 5) {
      sections.push(`*...and ${memory.solutions.length - 5} more solutions*`);
      sections.push("");
    }
  }

  if (sections.length === 1) {
    return "No memory saved yet. Use `/remember <text>` to save insights.";
  }

  sections.push(`\n*Last accessed: ${memory.lastAccessed.toLocaleString()}*`);

  return sections.join("\n");
}

// ============================================================================
// Auto-Detection
// ============================================================================

/**
 * Detect tech stack from project files
 */
export async function detectTechStack(projectPath: string): Promise<string[]> {
  const techStack: string[] = [];

  const checks: Array<{ file: string; tech: string }> = [
    { file: "package.json", tech: "Node.js" },
    { file: "tsconfig.json", tech: "TypeScript" },
    { file: "next.config.js", tech: "Next.js" },
    { file: "next.config.mjs", tech: "Next.js" },
    { file: "vite.config.ts", tech: "Vite" },
    { file: "tailwind.config.js", tech: "Tailwind CSS" },
    { file: "tailwind.config.ts", tech: "Tailwind CSS" },
    { file: "Cargo.toml", tech: "Rust" },
    { file: "go.mod", tech: "Go" },
    { file: "requirements.txt", tech: "Python" },
    { file: "pyproject.toml", tech: "Python" },
    { file: "Gemfile", tech: "Ruby" },
    { file: "docker-compose.yml", tech: "Docker" },
    { file: "Dockerfile", tech: "Docker" },
    { file: ".github/workflows", tech: "GitHub Actions" },
    { file: "drizzle.config.ts", tech: "Drizzle ORM" },
    { file: "prisma/schema.prisma", tech: "Prisma" },
  ];

  for (const check of checks) {
    try {
      await fs.access(path.join(projectPath, check.file));
      if (!techStack.includes(check.tech)) {
        techStack.push(check.tech);
      }
    } catch {
      // File doesn't exist
    }
  }

  return techStack;
}

/**
 * Auto-detect and save tech stack
 */
export async function autoDetectAndSaveTechStack(
  instanceId: string,
  projectPath: string
): Promise<ProjectMemory> {
  const techStack = await detectTechStack(projectPath);
  return updateProjectMemory(instanceId, projectPath, { techStack });
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up old memory files (> 30 days)
 */
export async function cleanupOldMemory(): Promise<void> {
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  const now = Date.now();

  try {
    const files = await fs.readdir(MEMORY_DIR);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const filePath = path.join(MEMORY_DIR, file);
      const stats = await fs.stat(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);

        // Also remove from cache
        const key = file.replace(".json", "");
        memoryCache.delete(key);
      }
    }
  } catch {
    // Memory dir doesn't exist yet
  }
}

// Run cleanup daily
if (typeof setInterval !== "undefined") {
  setInterval(cleanupOldMemory, 24 * 60 * 60 * 1000);
}
