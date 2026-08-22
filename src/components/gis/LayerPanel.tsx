import { useRef, useState } from "react";
import { bbox as turfBbox } from "@turf/turf";
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Crosshair,
  Palette,
  Table2,
  Download,
  Upload,
  FolderPlus,
  Layers,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { importFiles, SUPPORTED_EXTENSIONS } from "@/lib/gis/import";
import { exportLayer, type ExportFormat } from "@/lib/gis/export";
import { squareMeters, formatArea } from "@/lib/gis/measure";
import type { GisLayer } from "@/lib/gis/types";
import { StyleEditor } from "./StyleEditor";
import { cn } from "@/lib/utils";
import type { LayerSource } from "@/lib/gis/types";

const exportFormats: Array<{ id: ExportFormat; label: string }> = [
  { id: "geojson", label: "GeoJSON" },
  { id: "kml", label: "KML" },
  { id: "kmz", label: "KMZ" },
  { id: "shp", label: "Shapefile (.zip)" },
];

export function LayerPanel() {
  const wb = useWorkbench();
  const { setTableOpen } = useMapRef();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [styleFor, setStyleFor] = useState<string | null>(null);
  const [exportFor, setExportFor] = useState<string | null>(null);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const { results, errors } = await importFiles(files);
      for (const r of results) {
        wb.addLayer({
          name: r.name,
          data: r.data,
          groupId: "imports",
          source: { kind: "import", fileName: r.name },
        });
      }
      if (results.length > 0) {
        toast.success(`Imported ${results.length} file${results.length > 1 ? "s" : ""}`, {
          description: `${results.reduce((a, r) => a + r.featureCount, 0)} features added`,
        });
        const first = results[0];
        if (first) zoomTo(first.data as never);
      }
      for (const e of errors) toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const { map } = useMapRef();
  const zoomTo = (data: GisLayer["data"]) => {
    if (!map || data.features.length === 0) return;
    try {
      const b = turfBbox(data as never) as [number, number, number, number];
      if (b.every((n) => Number.isFinite(n))) map.fitBounds(b, { padding: 60, maxZoom: 16 });
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-sidebar"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-primary" /> Layers
          <span className="num rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">
            {wb.layers.length}
          </span>
        </div>
        <button
          onClick={() => {
            const name = window.prompt("Name your new group", "New group");
            if (name) wb.addGroup(name);
          }}
          title="Add group"
          aria-label="Add group"
          className="rounded-lg p-1.5 hover:bg-sidebar-accent"
        >
          <FolderPlus className="size-4" />
        </button>
      </div>

      <div className="p-3">
        <button
          onClick={() => fileInput.current?.click()}
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors",
            dragging ? "border-primary bg-accent" : "border-border hover:border-primary",
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <Upload className="size-5 text-primary" />
          )}
          <span className="text-xs font-medium">Drop files or click to add data</span>
          <span className="text-[10px] text-muted-foreground">
            GeoJSON · KML · KMZ · Shapefile .zip · GPX · CSV
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={SUPPORTED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            void handleFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-6">
        {wb.groups.map((group) => {
          const layers = wb.layers.filter((l) => l.groupId === group.id);
          return (
            <div key={group.id} className="mb-2">
              <button
                onClick={() => wb.toggleGroup(group.id)}
                className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent"
              >
                {group.collapsed ? (
                  <ChevronRight className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
                {group.name}
                <span className="num ml-auto text-[10px]">{layers.length}</span>
              </button>
              {!group.collapsed && (
                <div className="space-y-1 pl-1">
                  {layers.length === 0 && (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground">Nothing here yet</p>
                  )}
                  {layers.map((layer) => {
                    const selected = wb.selectedLayerIds.includes(layer.id);
                    const sqm = squareMeters(layer.data);
                    return (
                      <div
                        key={layer.id}
                        className={cn(
                          "rounded-xl border px-2 py-2 transition-colors",
                          selected
                            ? "border-primary bg-accent/60"
                            : "border-transparent hover:bg-sidebar-accent",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => wb.toggleVisible(layer.id)}
                            aria-label={layer.visible ? "Hide layer" : "Show layer"}
                            className="mt-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            {layer.visible ? (
                              <Eye className="size-4" />
                            ) : (
                              <EyeOff className="size-4" />
                            )}
                          </button>
                          <span
                            className="mt-1 size-3 shrink-0 rounded-sm border"
                            style={{
                              backgroundColor: layer.style.fillColor,
                              borderColor: layer.style.strokeColor,
                            }}
                          />
                          <button
                            onClick={(e) =>
                              wb.toggleLayerSelection(layer.id, e.metaKey || e.ctrlKey)
                            }
                            onDoubleClick={() => {
                              const name = window.prompt("Rename layer", layer.name);
                              if (name) wb.updateLayer(layer.id, { name });
                            }}
                            className="flex-1 text-left"
                          >
                            <div className="truncate text-xs font-medium">{layer.name}</div>
                            <div className="num text-[10px] text-muted-foreground">
                              {layer.source.kind === "remote" &&
                              layer.source.minZoom !== undefined &&
                              layer.data.features.length === 0
                                ? `Ready · appears at zoom ${layer.source.minZoom}+`
                                : `${layer.data.features.length} features`}
                              {sqm > 0 ? ` · ${formatArea(sqm, wb.units.area)}` : ""}
                            </div>
                          </button>
                        </div>

                        {selected && (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap gap-1">
                              <IconBtn
                                label="Zoom to layer"
                                onClick={() => zoomTo(layer.data)}
                                icon={<Crosshair className="size-3.5" />}
                              />
                              <IconBtn
                                label="Style"
                                onClick={() => setStyleFor(styleFor === layer.id ? null : layer.id)}
                                icon={<Palette className="size-3.5" />}
                                active={styleFor === layer.id}
                              />
                              <IconBtn
                                label="Attribute table"
                                onClick={() => {
                                  wb.setActiveLayer(layer.id);
                                  setTableOpen(true);
                                }}
                                icon={<Table2 className="size-3.5" />}
                              />
                              <IconBtn
                                label="Export"
                                onClick={() =>
                                  setExportFor(exportFor === layer.id ? null : layer.id)
                                }
                                icon={<Download className="size-3.5" />}
                                active={exportFor === layer.id}
                              />
                              <IconBtn
                                label="Move up"
                                onClick={() => wb.moveLayer(layer.id, -1)}
                                icon={<ArrowUp className="size-3.5" />}
                              />
                              <IconBtn
                                label="Move down"
                                onClick={() => wb.moveLayer(layer.id, 1)}
                                icon={<ArrowDown className="size-3.5" />}
                              />
                              <IconBtn
                                label="Duplicate"
                                onClick={() => wb.duplicateLayer(layer.id)}
                                icon={<Copy className="size-3.5" />}
                              />
                              <IconBtn
                                label="Delete"
                                onClick={() => wb.removeLayers([layer.id])}
                                icon={<Trash2 className="size-3.5" />}
                                danger
                              />
                            </div>

                            <select
                              value={layer.groupId}
                              onChange={(e) => wb.setLayerGroup(layer.id, e.target.value)}
                              aria-label="Move layer to group"
                              className="w-full rounded-lg border border-border bg-card px-2 py-1 text-[11px]"
                            >
                              {wb.groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>

                            {exportFor === layer.id && (
                              <div className="grid grid-cols-2 gap-1">
                                {exportFormats.map((f) => (
                                  <button
                                    key={f.id}
                                    onClick={() => {
                                      void exportLayer(layer.data, layer.name, f.id)
                                        .then(() => toast.success(`Exported ${f.label}`))
                                        .catch((err: unknown) =>
                                          toast.error(
                                            err instanceof Error ? err.message : "Export failed",
                                          ),
                                        );
                                    }}
                                    className="rounded-lg bg-card px-2 py-1 text-[11px] hover:bg-accent"
                                  >
                                    {f.label}
                                  </button>
                                ))}
                              </div>
                            )}

                            {styleFor === layer.id && <StyleEditor layer={layer} />}

                            {layer.source.kind === "remote" && (
                              <RemoteLayerSettings layerId={layer.id} source={layer.source} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {wb.selectedLayerIds.length > 1 && (
          <button
            onClick={() => wb.removeLayers(wb.selectedLayerIds)}
            className="mt-2 w-full rounded-xl bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground"
          >
            Delete {wb.selectedLayerIds.length} selected layers
          </button>
        )}

        <p className="mt-4 rounded-xl bg-secondary/60 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
          Sketches and measurements are for planning only. They are not a survey and do not
          establish legal boundaries or ownership.
        </p>
      </div>
    </div>
  );
}

function RemoteLayerSettings({
  layerId,
  source,
}: {
  layerId: string;
  source: Extract<LayerSource, { kind: "remote" }>;
}) {
  const wb = useWorkbench();
  return (
    <div className="space-y-1 rounded-lg bg-card p-2 text-[10px] text-muted-foreground">
      <p>
        Public data · {source.attribution ?? "official service"}
        {source.requiresViewport ? " · current view only" : ""}
      </p>
      <label className="flex items-center gap-2">
        Auto refresh
        <select
          value={source.refreshMinutes ?? 0}
          onChange={(event) => {
            const minutes = Number(event.target.value);
            const nextSource = { ...source };
            delete nextSource.refreshMinutes;
            wb.updateLayer(layerId, {
              source: minutes ? { ...nextSource, refreshMinutes: minutes } : nextSource,
            });
          }}
          className="ml-auto rounded border border-border bg-secondary px-1 py-0.5 text-[10px]"
        >
          <option value={0}>Off</option>
          <option value={5}>5 min</option>
          <option value={15}>15 min</option>
          <option value={60}>Hourly</option>
        </select>
      </label>
      {source.lastRefreshedAt && (
        <p>Updated {new Date(source.lastRefreshedAt).toLocaleTimeString()}</p>
      )}
    </div>
  );
}

function IconBtn({
  label,
  icon,
  onClick,
  active,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "border-primary bg-primary text-primary-foreground",
        danger && "text-destructive hover:bg-destructive hover:text-destructive-foreground",
      )}
    >
      {icon}
    </button>
  );
}
