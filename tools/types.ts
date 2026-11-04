import type { Tool } from "ai";
import type { LucideIcon } from "lucide-react";

/** Node types a tool can be attached to. */
export type ToolNodeType = "text" | "image" | "video";

/**
 * Client-safe description of a tool, used to list and attach tools in the UI.
 * Must not import anything server-only.
 */
export interface ToolMeta {
  /** Stable ID. Saved on nodes and used as the tool name the model sees. */
  id: string;
  label: string;
  /** Short description shown in the tool picker. */
  description: string;
  icon: LucideIcon;
  /** Which node types this tool can be attached to. */
  nodeTypes: ToolNodeType[];
}

/** A tool's metadata plus the AI SDK tool that runs on the server. */
export interface ServerToolDefinition {
  meta: ToolMeta;
  tool: Tool;
}
