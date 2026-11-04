/**
 * Server-side tool registry. Import only from server code (route handlers,
 * server actions).
 */
import type { ToolSet } from "ai";
import { geocodeTool } from "./geocode/tool";
import type { ServerToolDefinition, ToolNodeType } from "./types";

const serverTools: ServerToolDefinition[] = [geocodeTool];

/**
 * Turns tool IDs sent by the client into an AI SDK `ToolSet`. Unknown IDs, and
 * tools that don't apply to `nodeType`, are rejected rather than ignored.
 */
export const resolveTools = (ids: unknown, nodeType: ToolNodeType): ToolSet => {
  if (ids === undefined) {
    return {};
  }

  if (!(Array.isArray(ids) && ids.every((id) => typeof id === "string"))) {
    throw new Error("Tools must be an array of tool IDs");
  }

  const tools: ToolSet = {};

  for (const id of new Set(ids)) {
    const definition = serverTools.find((t) => t.meta.id === id);

    if (!definition) {
      throw new Error(`Unknown tool: ${id}`);
    }

    if (!definition.meta.nodeTypes.includes(nodeType)) {
      throw new Error(`Tool "${id}" can't be used on ${nodeType} nodes`);
    }

    tools[id] = definition.tool;
  }

  return tools;
};
