import { useEffect, useState } from "react";
import { Layers2, Check } from "lucide-react";
import { basemaps } from "@/lib/gis/basemaps";
import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { cn } from "@/lib/utils";

export function BasemapControl({ dropDirection = "up" }: { dropDirection?: "up" | "down" }) {
  const wb = useWorkbench();
  const { map } = useMapRef();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(6);
  const active = basemaps.find((b) => b.id === wb.basemapId);

  useEffect(() => {
    if (!map) return;
    const updateZoom = () => setZoom(map.getZoom());
    updateZoom();
    map.on("zoom", updateZoom);
    return () => {
      map.off("zoom", updateZoom);
    };
  }, [map]);

  return (
    <div className="relative flex flex-col items-end gap-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Choose basemap. Current basemap: ${active?.label ?? "Basemap"}`}
        title="Choose the background map"
        className="float-surface flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium"
      >
        <Layers2 className="size-4 text-primary" />
        <span className="hidden sm:inline">{active?.label ?? "Basemap"}</span>
      </button>
      <span
        className="num float-surface whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-semibold"
        aria-label={`Current map zoom ${zoom.toFixed(1)}`}
        title="Current map zoom level"
      >
        Zoom {zoom.toFixed(1)}×
      </span>
      {open && (
        <div
          className={cn(
            "float-surface absolute right-0 z-40 max-h-[calc(100dvh-13rem)] w-56 overflow-y-auto rounded-2xl p-1",
            dropDirection === "down" ? "top-full mt-2" : "bottom-full mb-2",
          )}
        >
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
