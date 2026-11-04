import { WrenchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getToolsForNodeType, type ToolNodeType } from "@/tools";

interface ToolSelectorProps {
  nodeType: ToolNodeType;
  value: string[];
  onChange: (value: string[]) => void;
}

/** Lets the user attach tools to a node. Renders nothing if none apply. */
export const ToolSelector = ({
  nodeType,
  value,
  onChange,
}: ToolSelectorProps) => {
  const tools = getToolsForNodeType(nodeType);

  if (!tools.length) {
    return null;
  }

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Tools"
          className="relative rounded-full"
          size="icon"
          variant={value.length ? "secondary" : "ghost"}
        >
          <WrenchIcon size={12} />
          {value.length > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {value.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Tools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tools.map((tool) => (
          <DropdownMenuCheckboxItem
            checked={value.includes(tool.id)}
            className="items-start"
            key={tool.id}
            onCheckedChange={(checked) => toggle(tool.id, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            <tool.icon className="mt-0.5 shrink-0" size={14} />
            <div className="flex flex-col gap-0.5">
              <span>{tool.label}</span>
              <span className="text-muted-foreground text-xs">
                {tool.description}
              </span>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
