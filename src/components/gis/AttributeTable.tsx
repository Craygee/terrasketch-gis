import { useMemo, useState } from "react";
import { bbox as turfBbox } from "@turf/turf";
import { Search, X, Table2, Crosshair } from "lucide-react";
import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { propertyKeys } from "@/lib/gis/labels";
import { formatArea, squareMeters } from "@/lib/gis/measure";
import { cn } from "@/lib/utils";

export function AttributeTable() {
  const wb = useWorkbench();
  const { tableOpen, setTableOpen, map } = useMapRef();
  const [query, setQuery] = useState("");
  const layer = wb.activeLayer;

  const keys = useMemo(
    () =>
      layer ? propertyKeys(layer.data.features as never).filter((k) => !k.startsWith("__")) : [],
    [layer],
  );

  const rows = useMemo(() => {
    if (!layer) return [];
    const q = query.trim().toLowerCase();
    return layer.data.features
      .map((f, index) => ({ f, index }))
      .filter(({ f }) =>
        q
          ? Object.values(f.properties ?? {}).some((v) =>
              String(v ?? "")
                .toLowerCase()
                .includes(q),
            )
          : true,
      );
  }, [layer, query]);

  if (!tableOpen) return null;

  return (
    <div className="panel-surface flex h-[45vh] flex-col rounded-t-2xl md:h-[38vh]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Table2 className="size-4 text-primary" />
        <span className="text-sm font-semibold">{layer ? layer.name : "Attribute table"}</span>
        <span className="num rounded-full bg-secondary px-2 text-[10px] text-muted-foreground">
          {rows.length} rows
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search attributes"
              aria-label="Search attributes"
              className="w-32 bg-transparent text-xs outline-none sm:w-48"
            />
          </div>
          <button
            onClick={() => setTableOpen(false)}
            aria-label="Close table"
            className="rounded-lg p-1 hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!layer ? (
        <p className="p-4 text-sm text-muted-foreground">
          Pick a layer in the panel to browse its attributes.
        </p>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-secondary">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">#</th>
                <th className="px-2 py-1.5 text-left font-semibold">Area</th>
                {keys.map((k) => (
                  <th key={k} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                    {k}
                  </th>
                ))}
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f, index }) => {
                const selected =
                  wb.selectedFeature?.layerId === layer.id && wb.selectedFeature.index === index;
                return (
                  <tr
                    key={index}
                    onClick={() => wb.setSelectedFeature({ layerId: layer.id, index })}
                    className={cn(
                      "cursor-pointer border-b border-border/60",
                      selected ? "bg-accent" : "hover:bg-secondary/60",
                    )}
                  >
                    <td className="num px-2 py-1 text-muted-foreground">{index + 1}</td>
                    <td className="num whitespace-nowrap px-2 py-1">
                      {squareMeters(f) > 0 ? formatArea(squareMeters(f), wb.units.area) : "—"}
                    </td>
                    {keys.map((k) => {
                      const v = (f.properties ?? {})[k];
                      return (
                        <td key={k} className="max-w-56 truncate px-2 py-1">
                          {v === null || v === undefined
                            ? ""
                            : typeof v === "object"
                              ? JSON.stringify(v)
                              : String(v)}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          try {
                            const b = turfBbox(f as never) as [number, number, number, number];
                            map?.fitBounds(b, { padding: 120, maxZoom: 17 });
                          } catch {
                            /* ignore */
                          }
                        }}
                        aria-label="Zoom to feature"
                        className="rounded p-1 text-primary hover:bg-accent"
                      >
                        <Crosshair className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
