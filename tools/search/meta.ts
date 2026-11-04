import { SearchIcon } from "lucide-react";
import type { ToolMeta } from "../types";

export const searchMeta: ToolMeta = {
  id: "search",
  label: "Search",
  description:
    "Find businesses and physical assets in a US area, e.g. coffee shops near an address or large warehouses in a city.",
  icon: SearchIcon,
  nodeTypes: ["text"],
};
