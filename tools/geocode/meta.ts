import { MapPinIcon } from "lucide-react";
import type { ToolMeta } from "../types";

export const geocodeMeta: ToolMeta = {
  id: "geocode",
  label: "Geocode",
  description: "Look up coordinates and census geographies for US addresses.",
  icon: MapPinIcon,
  nodeTypes: ["text"],
};
