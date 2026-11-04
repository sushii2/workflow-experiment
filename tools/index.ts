/**
 * Client-safe tool registry: metadata only, so the UI can list and attach
 * tools without bundling server code. The executable tools live in
 * `tools/server.ts`.
 *
 * To add a tool:
 *   1. Create `tools/<id>/meta.ts` (a `ToolMeta`) and `tools/<id>/tool.ts`
 *      (a `ServerToolDefinition` built with the AI SDK's `tool()`).
 *   2. Register the meta below and the tool in `tools/server.ts`.
 */
import { geocodeMeta } from "./geocode/meta";
import type { ToolMeta, ToolNodeType } from "./types";

export type { ToolMeta, ToolNodeType } from "./types";

export const toolList: ToolMeta[] = [geocodeMeta];

export const getToolsForNodeType = (nodeType: ToolNodeType): ToolMeta[] =>
  toolList.filter((tool) => tool.nodeTypes.includes(nodeType));

export const getToolMeta = (id: string): ToolMeta | undefined =>
  toolList.find((tool) => tool.id === id);
