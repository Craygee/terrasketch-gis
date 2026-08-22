import { useState } from "react";
import { Layers2, Check } from "lucide-react";
import { basemaps } from "@/lib/gis/basemaps";
import { useWorkbench } from "@/lib/gis/store";
import { cn } from "@/lib/utils";

export function BasemapControl() {
  const wb = useWorkbench();
  const [open, setOpen] = useState(false);
  const active = basemaps.find((b) => b.id === wb.basemapId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="float-surface flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium"
      >
        <Layers2 className="size-4 text-primary" />
        <span className="hidden sm:inline">{active?.label ?? "Basemap"}</span>
      </button>
      {open && (
        <div className="float-surface absolute bottom-full right-0 mb-2 w-56 overflow-hidden rounded-2xl p-1">
          {basemaps.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                wb.setBasemapId(b.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                b.id === wb.basemapId && "bg-secondary",
              )}
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{b.label}</div>
                <div className="text-[11px] text-muted-foreground">{b.blurb}</div>
              </div>
              {b.id === wb.basemapId && <Check className="mt-1 size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
