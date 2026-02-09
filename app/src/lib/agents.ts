/**
 * Multi-Agent System for Rodeo
 * Defines agent types with specific permissions and capabilities
 */

import type OpenAI from "openai";
import { TOOLS } from "./tools-schema";

// ============================================================================
// Types
// ============================================================================

export type AgentMode = "primary" | "subagent";

export type ToolPermission = "allow" | "deny";

export interface AgentPermission {
  read?: ToolPermission;
  edit?: ToolPermission;
  write?: ToolPermission;
  bash?: ToolPermission;
  glob?: ToolPermission;
  grep?: ToolPermission;
  list?: ToolPermission;
  task?: ToolPermission;
  websearch?: ToolPermission;
}

export interface AgentInfo {
  name: string;
  mode: AgentMode;
  description: string;
  permission: AgentPermission;
  model?: {
    provider: string;
    modelId: string;
  };
}

// ============================================================================
// Agent Definitions
// ============================================================================

export const AGENTS: Record<string, AgentInfo> = {
  build: {
    name: "build",
    mode: "primary",
    description: "Default agent for writing and editing code. Has full access to all tools.",
    permission: {
      read: "allow",
      edit: "allow",
      write: "allow",
      bash: "allow",
      glob: "allow",
      grep: "allow",
      list: "allow",
      task: "allow",
      websearch: "allow",
    },
  },

  plan: {
    name: "plan",
    mode: "primary",
    description: "Research and planning agent. Read-only access, creates implementation plans without making changes.",
    permission: {
      read: "allow",
      edit: "deny",
      write: "deny",
      bash: "deny",
      glob: "allow",
      grep: "allow",
      list: "allow",
      task: "deny",
      websearch: "allow",
    },
  },

  explore: {
    name: "explore",
    mode: "subagent",
    description: "Fast codebase exploration agent. Read, glob, grep only. Use for searching and understanding code.",
    permission: {
      read: "allow",
      edit: "deny",
      write: "deny",
      bash: "deny",
      glob: "allow",
      grep: "allow",
      list: "allow",
      task: "deny",
      websearch: "deny",
    },
  },

  general: {
    name: "general",
    mode: "subagent",
    description: "General purpose subagent for research and multi-step tasks. Can spawn other subagents.",
    permission: {
      read: "allow",
      edit: "allow",
      write: "allow",
      bash: "allow",
      glob: "allow",
      grep: "allow",
      list: "allow",
      task: "allow",
      websearch: "allow",
    },
  },
};

// ============================================================================
// Agent Utilities
// ============================================================================

/**
 * Get agent by name
 */
export function getAgent(name: string): AgentInfo | undefined {
  return AGENTS[name.toLowerCase()];
}

/**
 * List all agents
 */
export function listAgents(): AgentInfo[] {
  return Object.values(AGENTS);
}

/**
 * List primary agents (can be selected by user)
 */
export function listPrimaryAgents(): AgentInfo[] {
  return Object.values(AGENTS).filter((a) => a.mode === "primary");
}

/**
 * List subagents (can only be spawned by Task tool)
 */
export function listSubagents(): AgentInfo[] {
  return Object.values(AGENTS).filter((a) => a.mode === "subagent");
}

/**
 * Check if a tool is allowed for an agent
 */
export function isToolAllowed(agentName: string, toolName: string): boolean {
  const agent = getAgent(agentName);
  if (!agent) return false;

  const normalizedToolName = toolName.toLowerCase();
  const permission = agent.permission[normalizedToolName as keyof AgentPermission];

  // Default to allow if not specified
  return permission !== "deny";
}

/**
 * Get tools filtered for a specific agent
 */
export function getToolsForAgent(
  agentName: string,
  allTools: OpenAI.Chat.ChatCompletionTool[] = TOOLS
): OpenAI.Chat.ChatCompletionTool[] {
  const agent = getAgent(agentName);
  if (!agent) {
    console.warn(`Unknown agent: ${agentName}, returning all tools`);
    return allTools;
  }

  return allTools.filter((tool) => {
    const toolName = tool.function.name.toLowerCase();
    return isToolAllowed(agentName, toolName);
  });
}

/**
 * Get tool names allowed for an agent
 */
export function getToolNamesForAgent(agentName: string): string[] {
  const agent = getAgent(agentName);
  if (!agent) return [];

  const allToolNames = ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "List", "Task", "WebSearch"];

  return allToolNames.filter((toolName) => isToolAllowed(agentName, toolName));
}

/**
 * Validate that an agent can use a specific tool
 * @throws Error if tool is not allowed
 */
export function validateToolAccess(agentName: string, toolName: string): void {
  if (!isToolAllowed(agentName, toolName)) {
    const agent = getAgent(agentName);
    throw new Error(
      `Agent "${agentName}" (${agent?.mode || "unknown"}) is not allowed to use tool "${toolName}". ` +
        `Allowed tools: ${getToolNamesForAgent(agentName).join(", ")}`
    );
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  AGENTS,
  getAgent,
  listAgents,
  listPrimaryAgents,
  listSubagents,
  isToolAllowed,
  getToolsForAgent,
  getToolNamesForAgent,
  validateToolAccess,
};
