import { Hexagon, Minus, MapPin, Ruler, MousePointer2, Move3d } from "lucide-react";
import { useWorkbench, type DrawMode } from "@/lib/gis/store";
import { cn } from "@/lib/utils";
import { AREA_UNITS, LENGTH_UNITS, type AreaUnit, type LengthUnit } from "@/lib/gis/measure";

const tools: Array<{ mode: DrawMode; label: string; icon: React.ReactNode }> = [
  { mode: "none", label: "Select", icon: <MousePointer2 className="size-4" /> },
  { mode: "polygon", label: "Draw area", icon: <Hexagon className="size-4" /> },
  { mode: "line", label: "Draw line", icon: <Minus className="size-4" /> },
  { mode: "point", label: "Drop point", icon: <MapPin className="size-4" /> },
  { mode: "measure-area", label: "Measure area", icon: <Ruler className="size-4" /> },
  { mode: "measure-line", label: "Measure distance", icon: <Move3d className="size-4" /> },
];

export function DrawToolbar() {
  const wb = useWorkbench();
  return (
    <div className="float-surface flex items-center gap-1 rounded-2xl p-1.5">
      <div className="flex items-center gap-1">
        {tools.map((tool) => (
          <button
            key={tool.mode}
            onClick={() => wb.setDrawMode(tool.mode)}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={wb.drawMode === tool.mode}
            className={cn(
              "flex size-9 items-center justify-center rounded-xl transition-colors",
              wb.drawMode === tool.mode
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {tool.icon}
          </button>
        ))}
      </div>
      <div className="mx-1 h-7 w-px bg-border" />
      <select
        value={wb.units.area}
        onChange={(e) => wb.setUnits({ area: e.target.value as AreaUnit })}
        aria-label="Area units"
        className="h-8 rounded-lg bg-secondary px-2 text-xs text-secondary-foreground"
      >
        {(Object.keys(AREA_UNITS) as AreaUnit[]).map((u) => (
          <option key={u} value={u}>
            {AREA_UNITS[u].label}
          </option>
        ))}
      </select>
      <select
        value={wb.units.length}
        onChange={(e) => wb.setUnits({ length: e.target.value as LengthUnit })}
        aria-label="Length units"
        className="h-8 rounded-lg bg-secondary px-2 text-xs text-secondary-foreground"
      >
        {(Object.keys(LENGTH_UNITS) as LengthUnit[]).map((u) => (
          <option key={u} value={u}>
            {LENGTH_UNITS[u].label}
          </option>
        ))}
      </select>
    </div>
  );
}
