import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  Tag,
  Pencil,
  Search,
  ArrowUpToLine,
  ArrowDownToLine,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { importFiles, SUPPORTED_EXTENSIONS } from "@/lib/gis/import";
import { exportLayer, type ExportFormat } from "@/lib/gis/export";
import { squareMeters, formatArea } from "@/lib/gis/measure";
import type { FillPattern, GisLayer, LayerGroup, StrokePattern } from "@/lib/gis/types";
import { StyleEditor } from "./StyleEditor";
import { cn } from "@/lib/utils";
import type { LayerSource } from "@/lib/gis/types";
import { labelFieldsFromTemplate } from "@/lib/gis/labels";

const exportFormats: Array<{ id: ExportFormat; label: string }> = [
  { id: "geojson", label: "GeoJSON" },
  { id: "kml", label: "KML" },
  { id: "kmz", label: "KMZ" },
  { id: "shp", label: "Shapefile (.zip)" },
];

const remoteLoadLabel = (layer: GisLayer) => {
  if (layer.source.kind !== "remote") return null;
  const loaded = layer.source.loadedFeatures ?? layer.data.features.length;
  const expected = layer.source.expectedFeatures;
  if (layer.source.loadStatus === "loading")
    return expected !== undefined
      ? `Loading ${loaded.toLocaleString()} of ${expected.toLocaleString()} visible features…`
      : `Loading ${loaded.toLocaleString()} visible features…`;
  if (layer.source.loadStatus === "zoom-in")
    return `${(expected ?? 0).toLocaleString()} features in view · zoom in to load all`;
  if (layer.source.loadStatus === "error")
    return layer.source.loadError ?? "Visible area could not finish loading";
  if (layer.source.loadStatus === "complete")
    return `${loaded.toLocaleString()} visible features · complete`;
  if (layer.source.minZoom !== undefined && layer.data.features.length === 0)
    return `Ready · appears at zoom ${layer.source.minZoom}+`;
  return `${layer.data.features.length.toLocaleString()} visible features`;
};

type LayerDropPosition = "before" | "after";
type GroupDropPosition = "before" | "after";

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
  const draggedPointerRef = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const draggedGroupRef = useRef<string | null>(null);
  const draggedGroupPointerRef = useRef<number | null>(null);
  const [groupDropTarget, setGroupDropTarget] = useState<string | null>(null);
  const groupDropTargetRef = useRef<string | null>(null);
  const layerListRef = useRef<HTMLDivElement>(null);
  const [duplicateTargets, setDuplicateTargets] = useState<Record<string, string>>({});
  const [groupStyleFor, setGroupStyleFor] = useState<string | null>(null);
  const visibleGroups = flattenVisibleGroups(wb.groups);

  const updateDropTarget = (target: string | null) => {
    if (dropTargetRef.current === target) return;
    dropTargetRef.current = target;
    setDropTarget(target);
  };

  const resetLayerDrag = () => {
    draggedLayerRef.current = null;
    draggedPointerRef.current = null;
    dropTargetRef.current = null;
    setDraggedLayerId(null);
    setDropTarget(null);
  };

  const finishLayerDrag = () => {
    const dragged = draggedLayerRef.current;
    const target = dropTargetRef.current;
    if (!dragged || !target) {
      resetLayerDrag();
      return;
    }

    if (target.startsWith("group:")) {
      const groupId = target.slice("group:".length);
      const group = wb.groups.find((item) => item.id === groupId);
      wb.reorderLayer(dragged, groupId);
      if (group) toast.success(`Layer moved to ${group.name}`);
      resetLayerDrag();
      return;
    }

    const [, targetLayerId, position] = target.split(":") as [string, string, LayerDropPosition];
    const targetLayer = wb.layers.find((layer) => layer.id === targetLayerId);
    if (!targetLayer || targetLayer.id === dragged) {
      resetLayerDrag();
      return;
    }

    let beforeLayerId: string | undefined = targetLayer.id;
    if (position === "after") {
      const targetGroupLayers = wb.layers.filter(
        (layer) => layer.groupId === targetLayer.groupId && layer.id !== dragged,
      );
      const targetIndex = targetGroupLayers.findIndex((layer) => layer.id === targetLayer.id);
      beforeLayerId = targetGroupLayers[targetIndex + 1]?.id;
    }
    wb.reorderLayer(dragged, targetLayer.groupId, beforeLayerId);
    resetLayerDrag();
  };

  const updatePointerDropTarget = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (draggedPointerRef.current !== event.pointerId) return;
    event.preventDefault();

    const list = layerListRef.current;
    if (list) {
      const bounds = list.getBoundingClientRect();
      if (event.clientY < bounds.top + 36) list.scrollBy({ top: -14 });
      else if (event.clientY > bounds.bottom - 36) list.scrollBy({ top: 14 });
    }

    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const layerRow = hit?.closest<HTMLElement>("[data-layer-drop-id]");
    const dragged = draggedLayerRef.current;
    if (layerRow) {
      const targetLayerId = layerRow.dataset["layerDropId"];
      if (!targetLayerId || targetLayerId === dragged) {
        updateDropTarget(null);
        return;
      }
      const bounds = layerRow.getBoundingClientRect();
      const position: LayerDropPosition =
        event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      updateDropTarget(`layer:${targetLayerId}:${position}`);
      return;
    }

    const group = hit?.closest<HTMLElement>("[data-group-drop-id]");
    const groupId = group?.dataset["groupDropId"];
    updateDropTarget(groupId ? `group:${groupId}` : null);
  };

  const startPointerLayerDrag = (event: ReactPointerEvent<HTMLButtonElement>, layerId: string) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    draggedLayerRef.current = layerId;
    draggedPointerRef.current = event.pointerId;
    setDraggedLayerId(layerId);
    updateDropTarget(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateGroupDropTarget = (target: string | null) => {
    if (groupDropTargetRef.current === target) return;
    groupDropTargetRef.current = target;
    setGroupDropTarget(target);
  };

  const resetGroupDrag = () => {
    draggedGroupRef.current = null;
    draggedGroupPointerRef.current = null;
    groupDropTargetRef.current = null;
    setDraggedGroupId(null);
    setGroupDropTarget(null);
  };

  const updatePointerGroupDropTarget = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (draggedGroupPointerRef.current !== event.pointerId) return;
    event.preventDefault();

    const list = layerListRef.current;
    if (list) {
      const bounds = list.getBoundingClientRect();
      if (event.clientY < bounds.top + 36) list.scrollBy({ top: -14 });
      else if (event.clientY > bounds.bottom - 36) list.scrollBy({ top: 14 });
    }

    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const targetHeader = hit?.closest<HTMLElement>("[data-group-header-id]");
    if (!targetHeader) {
      updateGroupDropTarget(null);
      return;
    }
    const targetGroupId = targetHeader.dataset["groupHeaderId"];
    const dragged = wb.groups.find((group) => group.id === draggedGroupRef.current);
    const target = wb.groups.find((group) => group.id === targetGroupId);
    if (
      !dragged ||
      !target ||
      dragged.id === target.id ||
      (dragged.parentId ?? null) !== (target.parentId ?? null)
    ) {
      updateGroupDropTarget(null);
      return;
    }

    const bounds = targetHeader.getBoundingClientRect();
    const position: GroupDropPosition =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    updateGroupDropTarget(`${target.id}:${position}`);
  };

  const finishGroupDrag = () => {
    const dragged = draggedGroupRef.current;
    const target = groupDropTargetRef.current;
    if (!dragged || !target) {
      resetGroupDrag();
      return;
    }
    const separator = target.lastIndexOf(":");
    const targetGroupId = target.slice(0, separator);
    const position = target.slice(separator + 1) as GroupDropPosition;
    wb.reorderGroup(dragged, targetGroupId, position);
    toast.success("Layer group reordered");
    resetGroupDrag();
  };

  const startPointerGroupDrag = (event: ReactPointerEvent<HTMLButtonElement>, groupId: string) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    draggedGroupRef.current = groupId;
    draggedGroupPointerRef.current = event.pointerId;
    setDraggedGroupId(groupId);
    updateGroupDropTarget(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

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

      <div ref={layerListRef} className="flex-1 overflow-y-auto px-2 pb-6">
        {visibleGroups.map(({ group, depth }) => {
          const layers = wb.layers.filter((l) => l.groupId === group.id);
          const childGroups = wb.groups.filter((item) => item.parentId === group.id);
          const groupedLayerIds = nestedGroupIds(group.id, wb.groups);
          const groupedLayers = wb.layers.filter((layer) => groupedLayerIds.has(layer.groupId));
          const allVisible =
            groupedLayers.length > 0 && groupedLayers.every((layer) => layer.visible);
          return (
            <div
              key={group.id}
              data-group-drop-id={group.id}
              style={{ marginLeft: depth * 12 }}
              className={cn(
                "mb-2 rounded-xl transition-colors",
                dropTarget === `group:${group.id}` && "bg-accent/70 ring-2 ring-primary/60",
                draggedGroupId === group.id && "opacity-40",
                groupDropTarget === `${group.id}:before` &&
                  "shadow-[0_-3px_0_0_hsl(var(--primary))]",
                groupDropTarget === `${group.id}:after` && "shadow-[0_3px_0_0_hsl(var(--primary))]",
              )}
            >
              <div
                data-group-header-id={group.id}
                className="flex items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent"
              >
                <button
                  onClick={() => wb.toggleGroup(group.id)}
                  className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                >
                  {group.collapsed ? (
                    <ChevronRight className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{group.name}</span>
                  <span className="num ml-auto text-[10px]">{groupedLayers.length}</span>
                </button>
                <button
                  onClick={() => wb.setGroupVisible(group.id, !allVisible)}
                  aria-label={allVisible ? `Hide ${group.name}` : `Show ${group.name}`}
                  title={allVisible ? "Hide group" : "Show group"}
                  className="rounded p-1 hover:bg-accent hover:text-foreground"
                >
                  {allVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
                <button
                  onClick={() => setGroupStyleFor(groupStyleFor === group.id ? null : group.id)}
                  aria-label={`Style ${group.name}`}
                  title="Style every layer in group"
                  className={cn(
                    "rounded p-1 hover:bg-accent hover:text-foreground",
                    groupStyleFor === group.id && "bg-primary text-primary-foreground",
                  )}
                >
                  <Palette className="size-3.5" />
                </button>
                <button
                  onClick={() => {
                    const name = window.prompt(
                      `Name a subgroup inside ${group.name}`,
                      "New subgroup",
                    );
                    if (name) wb.addSubgroup(group.id, name);
                  }}
                  aria-label={`Add subgroup inside ${group.name}`}
                  title="Add subgroup"
                  className="mr-1 rounded p-1 hover:bg-accent hover:text-foreground"
                >
                  <FolderPlus className="size-3.5" />
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => startPointerGroupDrag(event, group.id)}
                  onPointerMove={updatePointerGroupDropTarget}
                  onPointerUp={(event) => {
                    if (draggedGroupPointerRef.current !== event.pointerId) return;
                    updatePointerGroupDropTarget(event);
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    finishGroupDrag();
                  }}
                  onPointerCancel={resetGroupDrag}
                  aria-label={`Drag ${group.name} group to reorder`}
                  title={
                    depth === 0
                      ? "Drag to reorder this group and its complete layer stack"
                      : "Drag to reorder this subgroup within its parent"
                  }
                  className={cn(
                    "mr-0.5 flex size-7 shrink-0 touch-none select-none items-center justify-center rounded hover:bg-accent hover:text-foreground",
                    draggedGroupId === group.id
                      ? "cursor-grabbing bg-accent text-foreground"
                      : "cursor-grab",
                  )}
                >
                  <GripVertical className="pointer-events-none size-4" />
                </button>
              </div>
              {groupStyleFor === group.id && (
                <GroupStyleEditor group={group} layers={groupedLayers} />
              )}
              {!group.collapsed && (
                <div className="space-y-1 pl-1">
                  {layers.length === 0 && childGroups.length === 0 && (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground">Nothing here yet</p>
                  )}
                  {layers.map((layer) => {
                    const selected = wb.selectedLayerIds.includes(layer.id);
                    const expanded = expandedLayers.has(layer.id);
                    const sqm = expanded ? squareMeters(layer.data) : 0;
                    const labelFields =
                      layer.style.labelFields?.length > 0
                        ? layer.style.labelFields
                        : labelFieldsFromTemplate(layer.style.labelTemplate);
                    return (
                      <div
                        key={layer.id}
                        data-layer-drop-id={layer.id}
                        className={cn(
                          "rounded-xl border px-1.5 py-1.5 transition-all",
                          selected
                            ? "border-primary bg-accent/60"
                            : "border-transparent hover:bg-sidebar-accent",
                          draggedLayerId === layer.id && "opacity-40",
                          dropTarget === `layer:${layer.id}:before` &&
                            "border-primary shadow-[0_-3px_0_0_hsl(var(--primary))]",
                          dropTarget === `layer:${layer.id}:after` &&
                            "border-primary shadow-[0_3px_0_0_hsl(var(--primary))]",
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
                            {layer.source.kind === "remote" && (
                              <div
                                className={cn(
                                  "num flex items-center gap-1 truncate text-[9px] text-muted-foreground",
                                  layer.source.loadStatus === "error" && "text-destructive",
                                )}
                                title={remoteLoadLabel(layer) ?? undefined}
                              >
                                {layer.source.loading && (
                                  <Loader2 className="size-2.5 shrink-0 animate-spin" />
                                )}
                                {remoteLoadLabel(layer)}
                              </div>
                            )}
                            {labelFields.length > 0 && (
                              <div className="num flex items-center gap-1 truncate text-[9px] text-muted-foreground">
                                <Tag className="size-2.5 shrink-0" />
                                {layer.style.labelEnabled ? "Labels" : "Labels off"} ·{" "}
                                {labelFields.join(" + ")}
                              </div>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (layer.style.labelTemplate.trim())
                                wb.updateStyle(layer.id, {
                                  labelEnabled: !layer.style.labelEnabled,
                                });
                              else {
                                setStyleFor(layer.id);
                                setExpandedLayers((current) => new Set(current).add(layer.id));
                              }
                            }}
                            aria-label={
                              layer.style.labelTemplate.trim()
                                ? layer.style.labelEnabled
                                  ? "Turn labels off"
                                  : "Turn labels on"
                                : "Set up labels"
                            }
                            title={
                              layer.style.labelTemplate.trim()
                                ? layer.style.labelEnabled
                                  ? "Turn labels off"
                                  : "Turn labels on"
                                : "Set up labels"
                            }
                            className={cn(
                              "rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground",
                              layer.style.labelEnabled && "bg-primary text-primary-foreground",
                            )}
                          >
                            <Tag className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onPointerDown={(event) => startPointerLayerDrag(event, layer.id)}
                            onPointerMove={updatePointerDropTarget}
                            onPointerUp={(event) => {
                              if (draggedPointerRef.current !== event.pointerId) return;
                              updatePointerDropTarget(event);
                              if (event.currentTarget.hasPointerCapture(event.pointerId))
                                event.currentTarget.releasePointerCapture(event.pointerId);
                              finishLayerDrag();
                            }}
                            onPointerCancel={resetLayerDrag}
                            aria-label={`Drag ${layer.name} to reorder`}
                            title="Drag layer up, down, or into another group"
                            className={cn(
                              "-mr-0.5 flex size-7 shrink-0 touch-none select-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                              draggedLayerId === layer.id
                                ? "cursor-grabbing bg-accent text-foreground"
                                : "cursor-grab",
                            )}
                          >
                            <GripVertical className="size-4 pointer-events-none" />
                          </button>
                        </div>

                        {expanded && (
                          <div className="mt-2 space-y-2">
                            <div className="num px-1 text-[10px] text-muted-foreground">
                              {remoteLoadLabel(layer) ??
                                `${layer.data.features.length.toLocaleString()} features`}
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
                                label="Bring to front"
                                onClick={() => wb.moveLayerToEdge(layer.id, "front")}
                                icon={<ArrowUpToLine className="size-3.5" />}
                              />
                              <IconBtn
                                label="Send to back"
                                onClick={() => wb.moveLayerToEdge(layer.id, "back")}
                                icon={<ArrowDownToLine className="size-3.5" />}
                              />
                              <IconBtn
                                label="Delete"
                                onClick={() => wb.removeLayers([layer.id])}
                                icon={<Trash2 className="size-3.5" />}
                                danger
                              />
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

                            <details className="group rounded-lg border border-border bg-card/50">
                              <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1.5 text-[10px] font-semibold">
                                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                                Advanced layer options
                              </summary>
                              <div className="space-y-2 border-t border-border p-2">
                                <div className="grid grid-cols-2 gap-1">
                                  <label className="text-[10px] text-muted-foreground">
                                    Move to
                                    <select
                                      value={layer.groupId}
                                      onChange={(event) =>
                                        wb.setLayerGroup(layer.id, event.target.value)
                                      }
                                      aria-label="Move layer to category"
                                      className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-foreground"
                                    >
                                      {wb.groups.map((group) => (
                                        <option key={group.id} value={group.id}>
                                          {group.name}
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
                                        const target = wb.groups.find(
                                          (group) => group.id === groupId,
                                        );
                                        toast.success(
                                          `Layer duplicated into ${target?.name ?? "category"}`,
                                        );
                                      }}
                                      aria-label="Duplicate layer into category"
                                      className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-foreground"
                                    >
                                      {wb.groups.map((group) => (
                                        <option key={group.id} value={group.id}>
                                          {group.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                {layer.source.kind === "remote" && (
                                  <RemoteLayerSettings layerId={layer.id} source={layer.source} />
                                )}
                                <FeatureSublayers layer={layer} onZoom={zoomTo} />
                              </div>
                            </details>
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

function featureDisplayName(layer: GisLayer, index: number): string {
  const properties = layer.data.features[index]?.properties ?? {};
  const preferred = ["NAME", "name", "LABEL", "label", "OWNER", "owner", "ID", "id"];
  const key = preferred.find((field) => properties[field] !== undefined);
  return key ? String(properties[key]) : `Feature ${index + 1}`;
}

function FeatureSublayers({
  layer,
  onZoom,
}: {
  layer: GisLayer;
  onZoom: (data: GisLayer["data"]) => void;
}) {
  const wb = useWorkbench();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const matches = layer.data.features
    .map((feature, index) => ({ feature, index, name: featureDisplayName(layer, index) }))
    .filter(({ feature, name }) => {
      if (!normalizedQuery) return true;
      return `${name} ${JSON.stringify(feature.properties ?? {})}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  const visible = matches.slice(0, 100);

  return (
    <details className="group rounded-lg border border-border bg-card/70">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1.5 text-[10px] font-semibold">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        Features as sublayers ({layer.data.features.length})
      </summary>
      <div className="space-y-2 border-t border-border p-2">
        <label className="relative block">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a feature or attribute"
            className="w-full rounded-lg border border-border bg-secondary py-1.5 pl-7 pr-2 text-[10px] outline-none focus:border-primary"
          />
        </label>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {visible.map(({ feature, index, name }) => {
            const hidden = feature.properties?.["__hidden"] === true;
            const selected = wb.selectedFeatures.some(
              (selection) => selection.layerId === layer.id && selection.index === index,
            );
            return (
              <div
                key={`${index}-${name}`}
                className={cn(
                  "flex items-center gap-1 rounded-lg border px-1.5 py-1",
                  selected ? "border-primary bg-accent" : "border-transparent bg-secondary/50",
                )}
              >
                <button
                  onClick={() => wb.updateFeatureProperties(layer.id, index, { __hidden: !hidden })}
                  title={hidden ? "Show feature" : "Hide feature"}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
                <button
                  onClick={() => {
                    wb.setActiveLayer(layer.id);
                    wb.setSelectedFeatures([{ layerId: layer.id, index }]);
                    onZoom({ type: "FeatureCollection", features: [feature] });
                  }}
                  className="min-w-0 flex-1 truncate text-left text-[10px]"
                  title={name}
                >
                  {name}
                </button>
                <button
                  onClick={() => {
                    const next = window.prompt("Rename feature", name)?.trim();
                    if (next) wb.updateFeatureProperties(layer.id, index, { NAME: next });
                  }}
                  title="Rename feature"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  onClick={() => {
                    if (layer.source.kind === "remote")
                      wb.updateFeatureProperties(layer.id, index, { __hidden: true });
                    else wb.removeFeatures(layer.id, [index]);
                  }}
                  title={
                    layer.source.kind === "remote"
                      ? "Hide public feature locally"
                      : "Delete feature"
                  }
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="py-2 text-center text-[10px] text-muted-foreground">
              No matching features
            </p>
          )}
        </div>
        {matches.length > visible.length && (
          <p className="text-[9px] text-muted-foreground">
            Showing the first 100 matches. Search to narrow this list.
          </p>
        )}
      </div>
    </details>
  );
}

function nestedGroupIds(groupId: string, groups: LayerGroup[]): Set<string> {
  const ids = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    groups.forEach((group) => {
      if (group.parentId && ids.has(group.parentId) && !ids.has(group.id)) {
        ids.add(group.id);
        changed = true;
      }
    });
  }
  return ids;
}

function flattenVisibleGroups(groups: LayerGroup[]): Array<{ group: LayerGroup; depth: number }> {
  const result: Array<{ group: LayerGroup; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (group: LayerGroup, depth: number) => {
    if (visited.has(group.id)) return;
    visited.add(group.id);
    result.push({ group, depth });
    if (!group.collapsed)
      groups.filter((item) => item.parentId === group.id).forEach((item) => visit(item, depth + 1));
  };
  groups
    .filter((group) => !group.parentId || !groups.some((item) => item.id === group.parentId))
    .forEach((group) => visit(group, 0));
  groups.filter((group) => !visited.has(group.id)).forEach((group) => visit(group, 0));
  return result;
}

function GroupStyleEditor({ group, layers }: { group: LayerGroup; layers: GisLayer[] }) {
  const wb = useWorkbench();
  const style = layers[0]?.style;
  if (!style)
    return (
      <p className="mx-2 mb-1 rounded-lg bg-secondary px-2 py-1.5 text-[10px] text-muted-foreground">
        Add a layer to this group before applying a shared style.
      </p>
    );
  return (
    <div className="mx-2 mb-2 space-y-2 rounded-xl border border-border bg-secondary/60 p-2">
      <p className="text-[10px] font-semibold">
        Apply to {layers.length} layer{layers.length === 1 ? "" : "s"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-muted-foreground">
          Fill
          <input
            type="color"
            value={style.fillColor}
            onChange={(event) => wb.applyStyleToGroup(group.id, { fillColor: event.target.value })}
            className="mt-0.5 h-7 w-full rounded border border-border bg-card"
          />
        </label>
        <label className="text-[10px] text-muted-foreground">
          Stroke
          <input
            type="color"
            value={style.strokeColor}
            onChange={(event) =>
              wb.applyStyleToGroup(group.id, { strokeColor: event.target.value })
            }
            className="mt-0.5 h-7 w-full rounded border border-border bg-card"
          />
        </label>
      </div>
      <label className="block text-[10px] text-muted-foreground">
        Fill opacity {Math.round(style.fillOpacity * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={style.fillOpacity}
          onChange={(event) =>
            wb.applyStyleToGroup(group.id, { fillOpacity: Number(event.target.value) })
          }
          className="w-full accent-primary"
        />
      </label>
      <div className="grid grid-cols-3 gap-1">
        {(["solid", "dashed", "dotted"] as StrokePattern[]).map((pattern) => (
          <button
            key={pattern}
            onClick={() => wb.applyStyleToGroup(group.id, { strokePattern: pattern })}
            className={cn(
              "rounded border px-1 py-1 text-[10px] capitalize",
              style.strokePattern === pattern
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card",
            )}
          >
            {pattern}
          </button>
        ))}
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
      {source.loadStatus === "zoom-in" && (
        <p className="text-amber-700">
          {source.expectedFeatures?.toLocaleString() ?? "Too many"} features are in this view. Zoom
          in once to load the complete visible set.
        </p>
      )}
      {source.loadStatus === "error" && source.loadError && (
        <p className="text-destructive">{source.loadError}</p>
      )}
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
