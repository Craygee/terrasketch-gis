import { useRef, useState } from "react";
import { bbox as turfBbox } from "@turf/turf";
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  GripVertical,
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
import type { FillPattern, GisLayer, StrokePattern } from "@/lib/gis/types";
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
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(() => new Set());
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const draggedLayerRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [duplicateTargets, setDuplicateTargets] = useState<Record<string, string>>({});

  const toggleLayerExpanded = (id: string) => {
    setExpandedLayers((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(e.dataTransfer.files));
        }
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
            <div
              key={group.id}
              className={cn(
                "mb-2 rounded-xl transition-colors",
                dropTarget === `group:${group.id}` && "bg-accent/70 ring-2 ring-primary/60",
              )}
              onDragOver={(event) => {
                if (!draggedLayerRef.current) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(`group:${group.id}`);
              }}
              onDrop={(event) => {
                const dragged = draggedLayerRef.current;
                if (!dragged) return;
                event.preventDefault();
                event.stopPropagation();
                wb.reorderLayer(dragged, group.id);
                draggedLayerRef.current = null;
                setDraggedLayerId(null);
                setDropTarget(null);
                toast.success(`Layer moved to ${group.name}`);
              }}
            >
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
                    const expanded = expandedLayers.has(layer.id);
                    const sqm = squareMeters(layer.data);
                    return (
                      <div
                        key={layer.id}
                        draggable
                        onDragStart={(event) => {
                          draggedLayerRef.current = layer.id;
                          setDraggedLayerId(layer.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("application/x-terrasketch-layer", layer.id);
                          event.dataTransfer.setData("text/plain", layer.name);
                        }}
                        onDragEnd={() => {
                          draggedLayerRef.current = null;
                          setDraggedLayerId(null);
                          setDropTarget(null);
                        }}
                        onDragOver={(event) => {
                          const dragged = draggedLayerRef.current;
                          if (!dragged || dragged === layer.id) return;
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = "move";
                          setDropTarget(`layer:${layer.id}`);
                        }}
                        onDrop={(event) => {
                          const dragged = draggedLayerRef.current;
                          if (!dragged || dragged === layer.id) return;
                          event.preventDefault();
                          event.stopPropagation();
                          wb.reorderLayer(dragged, layer.groupId, layer.id);
                          draggedLayerRef.current = null;
                          setDraggedLayerId(null);
                          setDropTarget(null);
                        }}
                        className={cn(
                          "rounded-xl border px-1.5 py-1.5 transition-all",
                          selected
                            ? "border-primary bg-accent/60"
                            : "border-transparent hover:bg-sidebar-accent",
                          draggedLayerId === layer.id && "opacity-40",
                          dropTarget === `layer:${layer.id}` &&
                            "border-primary shadow-[0_-3px_0_0_hsl(var(--primary))]",
                        )}
                      >
                        <div className="flex min-h-8 items-center gap-1.5">
                          <button
                            onClick={() => toggleLayerExpanded(layer.id)}
                            aria-label={expanded ? "Collapse layer" : "Expand layer"}
                            title={expanded ? "Collapse layer" : "Expand layer"}
                            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            {expanded ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => wb.toggleVisible(layer.id)}
                            aria-label={layer.visible ? "Hide layer" : "Show layer"}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            {layer.visible ? (
                              <Eye className="size-4" />
                            ) : (
                              <EyeOff className="size-4" />
                            )}
                          </button>
                          <LayerStyleSwatch layer={layer} />
                          <button
                            onClick={(e) =>
                              wb.toggleLayerSelection(layer.id, e.metaKey || e.ctrlKey)
                            }
                            onDoubleClick={() => {
                              const name = window.prompt("Rename layer", layer.name);
                              if (name) wb.updateLayer(layer.id, { name });
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-xs font-medium">{layer.name}</div>
                          </button>
                          <GripVertical
                            className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                            aria-label="Drag to reorder layer"
                          />
                        </div>

                        {expanded && (
                          <div className="mt-2 space-y-2">
                            <div className="num px-1 text-[10px] text-muted-foreground">
                              {layer.source.kind === "remote" && layer.source.loading
                                ? "Loading visible area…"
                                : layer.source.kind === "remote" &&
                                    layer.source.minZoom !== undefined &&
                                    layer.data.features.length === 0
                                  ? `Ready · appears at zoom ${layer.source.minZoom}+`
                                  : `${layer.data.features.length} features`}
                              {sqm > 0 ? ` · ${formatArea(sqm, wb.units.area)}` : ""}
                            </div>
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
                                label="Duplicate in this category"
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

                            <div className="grid grid-cols-2 gap-1">
                              <label className="text-[10px] text-muted-foreground">
                                Move to
                                <select
                                  value={layer.groupId}
                                  onChange={(e) => wb.setLayerGroup(layer.id, e.target.value)}
                                  aria-label="Move layer to category"
                                  className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-foreground"
                                >
                                  {wb.groups.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-[10px] text-muted-foreground">
                                Duplicate into
                                <select
                                  value={duplicateTargets[layer.id] ?? layer.groupId}
                                  onChange={(event) => {
                                    const groupId = event.target.value;
                                    wb.duplicateLayer(layer.id, groupId);
                                    setDuplicateTargets((current) => ({
                                      ...current,
                                      [layer.id]: layer.groupId,
                                    }));
                                    const target = wb.groups.find((group) => group.id === groupId);
                                    toast.success(
                                      `Layer duplicated into ${target?.name ?? "category"}`,
                                    );
                                  }}
                                  aria-label="Duplicate layer into category"
                                  className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-foreground"
                                >
                                  {wb.groups.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

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

function LayerStyleSwatch({ layer }: { layer: GisLayer }) {
  const fillPattern = layer.style.fillPattern as FillPattern;
  const strokePattern = (layer.style.strokePattern ?? "solid") as StrokePattern;
  const fill = layer.style.fillColor;
  const hasFill = layer.style.fillOpacity > 0;
  const backgroundImage = !hasFill
    ? undefined
    : fillPattern === "diagonal"
      ? `repeating-linear-gradient(135deg, transparent 0 3px, ${fill} 3px 5px)`
      : fillPattern === "horizontal"
        ? `repeating-linear-gradient(0deg, transparent 0 3px, ${fill} 3px 5px)`
        : fillPattern === "vertical"
          ? `repeating-linear-gradient(90deg, transparent 0 3px, ${fill} 3px 5px)`
          : fillPattern === "crosshatch"
            ? `repeating-linear-gradient(45deg, transparent 0 4px, ${fill} 4px 5px), repeating-linear-gradient(-45deg, transparent 0 4px, ${fill} 4px 5px)`
            : fillPattern === "dotted"
              ? `radial-gradient(circle, ${fill} 1.5px, transparent 1.7px)`
              : undefined;
  return (
    <span
      className="size-5 shrink-0 rounded bg-card"
      aria-label={`${hasFill ? fillPattern : "transparent"} fill with ${strokePattern} stroke`}
      title={`${hasFill ? fillPattern : "transparent"} fill · ${strokePattern} stroke`}
      style={{
        backgroundColor: !hasFill ? "transparent" : fillPattern === "solid" ? fill : `${fill}33`,
        backgroundImage,
        backgroundSize: fillPattern === "dotted" ? "6px 6px" : undefined,
        borderColor: layer.style.strokeColor,
        borderWidth: Math.max(1, Math.min(3, layer.style.strokeWidth)),
        borderStyle: strokePattern,
        opacity: hasFill ? Math.max(0.45, layer.style.fillOpacity + 0.35) : 1,
      }}
    />
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
