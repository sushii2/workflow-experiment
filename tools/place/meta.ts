import { Building2Icon } from "lucide-react";
import type { ToolMeta } from "../types";

export const placeMeta: ToolMeta = {
  id: "place",
  label: "Place",
  description:
    "Everything about a US address or point: what's there, the building, owner, zoning and risk factors.",
  icon: Building2Icon,
  nodeTypes: ["text"],
};
