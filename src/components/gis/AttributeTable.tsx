import { useEffect, useMemo, useState } from "react";
import { bbox as turfBbox } from "@turf/turf";
import { Search, X, Table2, Crosshair, CopyPlus, CheckSquare } from "lucide-react";
import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { propertyKeys } from "@/lib/gis/labels";
import { formatArea, squareMeters } from "@/lib/gis/measure";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

export function AttributeTable() {
  const wb = useWorkbench();
  const { tableOpen, setTableOpen, map, setPendingFeatureSave } = useMapRef();
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [operator, setOperator] = useState("contains");
  const [value, setValue] = useState("");
  const [page, setPage] = useState(0);
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
      .filter(({ f }) => {
        const searchMatch = q
          ? Object.values(f.properties ?? {}).some((v) =>
              String(v ?? "")
                .toLowerCase()
                .includes(q),
            )
          : true;
        if (!searchMatch || !field || !value) return searchMatch;
        const actual = (f.properties ?? {})[field];
        const actualText = String(actual ?? "").toLowerCase();
        const wanted = value.toLowerCase();
        const actualNumber = Number(actual);
        const wantedNumber = Number(value);
        if (operator === "equals") return actualText === wanted;
        if (operator === "starts") return actualText.startsWith(wanted);
        if (operator === "greater")
          return Number.isFinite(actualNumber) && actualNumber > wantedNumber;
        if (operator === "less")
          return Number.isFinite(actualNumber) && actualNumber < wantedNumber;
        return actualText.includes(wanted);
      });
  }, [layer, query, field, operator, value]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = useMemo(
    () => rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [rows, safePage],
  );
  const selectedIndexes = useMemo(
    () =>
      new Set(
        wb.selectedFeatures
          .filter((selection) => selection.layerId === layer?.id)
          .map((selection) => selection.index),
      ),
    [layer?.id, wb.selectedFeatures],
  );

  useEffect(() => setPage(0), [layer?.id, query, field, operator, value]);

  const selectResults = () => {
    if (!layer) return;
    wb.setSelectedFeatures(rows.map(({ index }) => ({ layerId: layer.id, index })));
  };

  const createFromResults = () => {
    if (!layer || rows.length === 0) return;
    setPendingFeatureSave({
      features: rows.map(({ f }) => structuredClone(f)),
      suggestedLayerName: `${layer.name} · selection`,
      defaultGroupId: wb.derivedLayerGroupId,
      source: {
        kind: "derived",
        sourceLayerId: layer.id,
        query: [field, operator, value].filter(Boolean).join(" ") || query,
      },
      style: layer.style,
    });
  };

  if (!tableOpen) return null;

  return (
    <div className="panel-surface flex h-[45vh] flex-col rounded-t-2xl md:h-[38vh]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Table2 className="size-4 text-primary" />
        <span className="text-sm font-semibold">{layer ? layer.name : "Attribute table"}</span>
        <span className="num rounded-full bg-secondary px-2 text-[10px] text-muted-foreground">
          {rows.length} rows
        </span>
        {rows.length > PAGE_SIZE && (
          <div className="flex items-center gap-1 text-[10px]">
            <button
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={safePage === 0}
              className="rounded-md bg-secondary px-2 py-1 disabled:opacity-40"
              aria-label="Previous table page"
            >
              Previous
            </button>
            <span className="num text-muted-foreground">
              {safePage + 1}/{pageCount}
            </span>
            <button
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={safePage >= pageCount - 1}
              className="rounded-md bg-secondary px-2 py-1 disabled:opacity-40"
              aria-label="Next table page"
            >
              Next
            </button>
          </div>
        )}
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
            title="Close the attribute table"
            className="rounded-lg p-1 hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {layer && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-secondary/40 px-3 py-2">
          <select
            value={field}
            onChange={(event) => setField(event.target.value)}
            aria-label="Attribute field"
            className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
          >
            <option value="">Any field</option>
            {keys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <select
            value={operator}
            onChange={(event) => setOperator(event.target.value)}
            aria-label="Attribute operator"
            className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
          >
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="starts">starts with</option>
            <option value="greater">is greater than</option>
            <option value="less">is less than</option>
          </select>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Value"
            aria-label="Attribute value"
            className="w-36 rounded-lg border border-border bg-card px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <button
            onClick={selectResults}
            className="ml-auto flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-xs hover:bg-accent"
          >
            <CheckSquare className="size-3.5" /> Select {rows.length}
          </button>
          <button
            onClick={createFromResults}
            disabled={rows.length === 0}
            className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
          >
            <CopyPlus className="size-3.5" /> New layer
          </button>
        </div>
      )}

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
              {visibleRows.map(({ f, index }) => {
                const selected = selectedIndexes.has(index);
                const area = squareMeters(f);
                return (
                  <tr
                    key={index}
                    onClick={(event) => {
                      const selection = { layerId: layer.id, index };
                      if (event.shiftKey || event.ctrlKey || event.metaKey) {
                        wb.setSelectedFeatures(
                          selected
                            ? wb.selectedFeatures.filter(
                                (item) => item.layerId !== layer.id || item.index !== index,
                              )
                            : [...wb.selectedFeatures, selection],
                        );
                      } else {
                        wb.setSelectedFeature(selection);
                      }
                    }}
                    className={cn(
                      "cursor-pointer border-b border-border/60",
                      selected ? "bg-accent" : "hover:bg-secondary/60",
                    )}
                  >
                    <td className="num px-2 py-1 text-muted-foreground">{index + 1}</td>
                    <td className="num whitespace-nowrap px-2 py-1">
                      {area > 0 ? formatArea(area, wb.units.area) : "—"}
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
                        title="Zoom the map to this feature"
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
