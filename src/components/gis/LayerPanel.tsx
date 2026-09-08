import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { bbox as turfBbox } from "@turf/turf";
import type { Feature } from "geojson";
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
  NotebookPen,
  Paperclip,
  FileText,
  Save,
  Search,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkbench } from "@/lib/gis/store";
import { useAuth } from "@/lib/auth";
import { useMapRef } from "@/lib/gis/mapRef";
import {
  deleteProjectAsset,
  downloadProjectAsset,
  uploadProjectAsset,
} from "@/lib/gis/projectRecords";
import { importFiles, SUPPORTED_EXTENSIONS } from "@/lib/gis/import";
import { exportLayer, type ExportFormat } from "@/lib/gis/export";
import { squareMeters, formatArea } from "@/lib/gis/measure";
import type {
  FillPattern,
  GisLayer,
  LayerGroup,
  ProjectDocument,
  StrokePattern,
} from "@/lib/gis/types";
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

const formatFileSize = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

type LayerDropPosition = "before" | "after";
type GroupDropPosition = "before" | "after";

export function LayerPanel() {
  const wb = useWorkbench();
  const auth = useAuth();
  const { setTableOpen } = useMapRef();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [styleFor, setStyleFor] = useState<string | null>(null);
  const [exportFor, setExportFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [attachmentBusyFor, setAttachmentBusyFor] = useState<string | null>(null);
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
  const [groupStyleFor, setGroupStyleFor] = useState<string | null>(null);
  const [groupMenuFor, setGroupMenuFor] = useState<string | null>(null);
  const visibleGroups = flattenVisibleGroups(wb.groups);

  const groupSelectedLayers = () => {
    const selectedIds = wb.layers
      .filter((layer) => wb.selectedLayerIds.includes(layer.id))
      .map((layer) => layer.id);
    if (selectedIds.length === 0) return;
    const name = window
      .prompt(
        `Name the group for ${selectedIds.length} selected layer${selectedIds.length === 1 ? "" : "s"}`,
        "New layer group",
      )
      ?.trim();
    if (!name) return;
    const groupId = wb.addGroup(name);
    selectedIds.forEach((layerId) => wb.setLayerGroup(layerId, groupId));
    wb.setSelectedLayers(selectedIds);
    toast.success(`${selectedIds.length} layer${selectedIds.length === 1 ? "" : "s"} grouped`, {
      description: `Moved into ${name}.`,
    });
  };

  const nestSelectedGroups = () => {
    if (!wb.selectedGroupIds.length) return;
    const name = window
      .prompt(
        `Name the parent group for ${wb.selectedGroupIds.length} selected data group${wb.selectedGroupIds.length === 1 ? "" : "s"}`,
        "New parent group",
      )
      ?.trim();
    if (!name) return;
    wb.groupSelectedGroups(wb.selectedGroupIds, name);
    toast.success("Data groups nested", {
      description: `The selected groups are now subgroups of ${name}.`,
    });
  };

  const addLayerAttachments = async (layer: GisLayer, files: FileList | null) => {
    if (!files?.length) return;
    if (!auth.user) {
      toast.error("Sign in before attaching files to a layer note");
      return;
    }
    setAttachmentBusyFor(layer.id);
    try {
      const added: ProjectDocument[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} is larger than the 50 MB project-file limit`);
          continue;
        }
        added.push(
          await uploadProjectAsset({
            userId: auth.user.id,
            projectId: wb.projectId,
            folderId: "general",
            fileName: file.name,
            data: file,
            source: "upload",
            uploadedBy: auth.user.name || auth.user.email,
            layerId: layer.id,
          }),
        );
      }
      if (!added.length) return;
      wb.setProjectRecords({
        ...wb.records,
        documents: [...added, ...wb.records.documents],
      });
      for (const document of added)
        wb.addProjectEvent({
          type: "upload",
          title: `Attached ${document.name} to ${layer.name}`,
          detail: `${formatFileSize(document.size)} · Layer note attachment`,
          relatedId: layer.id,
        });
      toast.success(
        `${added.length} attachment${added.length === 1 ? "" : "s"} added to ${layer.name}`,
      );
    } catch (error) {
      toast.error("Layer attachment could not be stored", {
        description: error instanceof Error ? error.message : "Cloud storage is unavailable",
      });
    } finally {
      setAttachmentBusyFor(null);
    }
  };

  const removeLayerAttachment = async (layer: GisLayer, document: ProjectDocument) => {
    if (!window.confirm(`Remove “${document.name}” from ${layer.name}?`)) return;
    setAttachmentBusyFor(layer.id);
    try {
      await deleteProjectAsset(document);
      wb.setProjectRecords({
        ...wb.records,
        documents: wb.records.documents.filter((item) => item.id !== document.id),
      });
      wb.addProjectEvent({
        type: "project",
        title: `Removed ${document.name}`,
        detail: `Removed from layer note: ${layer.name}`,
        relatedId: layer.id,
      });
      toast.success("Layer attachment removed");
    } catch (error) {
      toast.error("Layer attachment could not be removed", {
        description: error instanceof Error ? error.message : "Cloud storage is unavailable",
      });
    } finally {
      setAttachmentBusyFor(null);
    }
  };

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
          <Layers className="size-4 text-primary" /> Data Groups
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

      {wb.layers.length > 0 && (
        <div className="mx-2 mb-2 flex items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1.5 text-[10px]">
          <input
            type="checkbox"
            checked={wb.selectedLayerIds.length === wb.layers.length}
            ref={(input) => {
              if (input)
                input.indeterminate =
                  wb.selectedLayerIds.length > 0 && wb.selectedLayerIds.length < wb.layers.length;
            }}
            onChange={(event) =>
              wb.setSelectedLayers(event.target.checked ? wb.layers.map((layer) => layer.id) : [])
            }
            aria-label="Select all layers"
            title="Select or clear every layer"
            className="size-3.5 shrink-0 accent-primary"
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {wb.selectedLayerIds.length > 0
              ? `${wb.selectedLayerIds.length} selected`
              : "Select layers to group"}
          </span>
          {wb.selectedLayerIds.length > 0 && (
            <button
              type="button"
              onClick={groupSelectedLayers}
              className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 font-semibold text-primary-foreground"
              title="Create a group containing the checked layers"
            >
              <FolderPlus className="size-3" /> Group selected
            </button>
          )}
        </div>
      )}

      {wb.selectedGroupIds.length > 0 && (
        <div className="mx-2 mb-2 flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-2 py-1.5 text-[10px]">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {wb.selectedGroupIds.length} data group
            {wb.selectedGroupIds.length === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            onClick={nestSelectedGroups}
            className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 font-semibold text-primary-foreground"
            title="Create a parent group containing the selected groups as subgroups"
          >
            <FolderPlus className="size-3" /> Make subgroup
          </button>
          <button
            type="button"
            onClick={() => wb.setSelectedGroups([])}
            className="rounded-lg px-1.5 py-1 font-semibold text-muted-foreground hover:bg-accent"
          >
            Clear
          </button>
        </div>
      )}

      <div ref={layerListRef} className="flex-1 overflow-y-auto px-2 pb-6">
        {visibleGroups.map(({ group, depth }) => {
          const layers = wb.layers.filter((l) => l.groupId === group.id);
          const childGroups = wb.groups.filter((item) => item.parentId === group.id);
          const groupedLayerIds = nestedGroupIds(group.id, wb.groups);
          const groupedLayers = wb.layers.filter((layer) => groupedLayerIds.has(layer.groupId));
          const allVisible =
            groupedLayers.length > 0 && groupedLayers.every((layer) => layer.visible);
          const groupSelected = wb.selectedGroupIds.includes(group.id);
          const renameGroup = () => {
            const name = window.prompt("Rename layer group", group.name)?.trim();
            if (!name || name === group.name) return;
            wb.renameGroup(group.id, name);
            toast.success(`Group renamed to ${name}`);
          };
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
                className={cn(
                  "relative flex items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent",
                  groupSelected && "bg-accent text-foreground ring-1 ring-primary/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={groupSelected}
                  onChange={() => wb.toggleGroupSelection(group.id)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Select ${group.name} group`}
                  title="Select group for nesting"
                  className="ml-1.5 size-3.5 shrink-0 accent-primary"
                />
                <button
                  onClick={() => wb.toggleGroup(group.id)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    renameGroup();
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    renameGroup();
                  }}
                  title="Expand or collapse group · double-click or right-click to rename"
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
                  onClick={() => setGroupMenuFor(groupMenuFor === group.id ? null : group.id)}
                  aria-label={`Open actions for ${group.name}`}
                  title="Rename, style, add a subgroup, or delete"
                  className="rounded p-1 hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
                {groupMenuFor === group.id && (
                  <div className="absolute right-7 top-7 z-30 w-44 rounded-xl border border-border bg-popover p-1 text-[10px] normal-case tracking-normal text-popover-foreground shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setGroupMenuFor(null);
                        renameGroup();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent"
                    >
                      <Pencil className="size-3.5" /> Rename group
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupStyleFor(groupStyleFor === group.id ? null : group.id);
                        setGroupMenuFor(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent"
                    >
                      <Palette className="size-3.5" /> Style every layer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupMenuFor(null);
                        const name = window
                          .prompt(`Name a subgroup inside ${group.name}`, "New subgroup")
                          ?.trim();
                        if (name) wb.addSubgroup(group.id, name);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent"
                    >
                      <FolderPlus className="size-3.5" /> Add subgroup
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupMenuFor(null);
                        if (
                          !window.confirm(
                            `Delete the “${group.name}” group and its subgroups? Its map layers will be kept and moved to another data group.`,
                          )
                        )
                          return;
                        wb.removeGroup(group.id);
                        toast.success("Data group deleted", {
                          description: "Its layers were kept and moved to another group.",
                        });
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" /> Delete group
                    </button>
                  </div>
                )}
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
                    const layerAttachments = wb.records.documents.filter(
                      (document) => document.layerId === layer.id,
                    );
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
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => wb.toggleLayerSelection(layer.id, true)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Select ${layer.name} for batch actions`}
                            title="Select layer for batch actions"
                            className="size-3.5 shrink-0 accent-primary"
                          />
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
                                label={
                                  layer.note?.trim() || layerAttachments.length > 0
                                    ? "Edit layer note and attachments"
                                    : "Add layer note or attachment"
                                }
                                onClick={() => {
                                  setNoteDrafts((current) => ({
                                    ...current,
                                    [layer.id]: layer.note ?? "",
                                  }));
                                  setNoteFor(noteFor === layer.id ? null : layer.id);
                                }}
                                icon={<NotebookPen className="size-3.5" />}
                                active={
                                  noteFor === layer.id ||
                                  Boolean(layer.note?.trim()) ||
                                  layerAttachments.length > 0
                                }
                              />
                              <IconBtn
                                label="Delete"
                                onClick={() => wb.removeLayers([layer.id])}
                                icon={<Trash2 className="size-3.5" />}
                                danger
                              />
                            </div>

                            {noteFor === layer.id && (
                              <section className="rounded-xl border border-primary/30 bg-primary/5 p-2">
                                <label
                                  htmlFor={`layer-note-${layer.id}`}
                                  className="text-[10px] font-semibold text-foreground"
                                >
                                  Note and attachments for {layer.name}
                                </label>
                                <textarea
                                  id={`layer-note-${layer.id}`}
                                  value={noteDrafts[layer.id] ?? layer.note ?? ""}
                                  onChange={(event) =>
                                    setNoteDrafts((current) => ({
                                      ...current,
                                      [layer.id]: event.target.value,
                                    }))
                                  }
                                  rows={4}
                                  autoFocus
                                  placeholder="Add context, source details, decisions, or follow-up items for this layer…"
                                  className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] leading-relaxed outline-none focus:border-primary"
                                />
                                <div className="mt-1.5 rounded-lg border border-border bg-card/70 p-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Paperclip className="size-3 text-primary" />
                                    <span className="min-w-0 flex-1 text-[9px] font-semibold">
                                      Attachments
                                      {layerAttachments.length > 0
                                        ? ` (${layerAttachments.length})`
                                        : ""}
                                    </span>
                                    <label
                                      className={cn(
                                        "flex cursor-pointer items-center gap-1 rounded-md bg-secondary px-1.5 py-1 text-[9px] font-semibold hover:bg-accent",
                                        attachmentBusyFor === layer.id &&
                                          "pointer-events-none opacity-50",
                                      )}
                                    >
                                      <Upload className="size-2.5" /> Add
                                      <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        disabled={attachmentBusyFor === layer.id}
                                        onChange={(event) => {
                                          void addLayerAttachments(layer, event.target.files);
                                          event.currentTarget.value = "";
                                        }}
                                      />
                                    </label>
                                  </div>
                                  {layerAttachments.length > 0 ? (
                                    <div className="mt-1 space-y-1">
                                      {layerAttachments.map((document) => (
                                        <div
                                          key={document.id}
                                          className="flex items-center gap-1.5 rounded-md bg-background px-1.5 py-1"
                                        >
                                          <FileText className="size-3 shrink-0 text-muted-foreground" />
                                          <span className="min-w-0 flex-1 truncate text-[9px]">
                                            {document.name} · {formatFileSize(document.size)}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => void downloadProjectAsset(document)}
                                            className="rounded p-0.5 hover:bg-accent"
                                            aria-label={`Download ${document.name}`}
                                            title="Download attachment"
                                          >
                                            <Download className="size-2.5" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={attachmentBusyFor === layer.id}
                                            onClick={() =>
                                              void removeLayerAttachment(layer, document)
                                            }
                                            className="rounded p-0.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                            aria-label={`Remove ${document.name}`}
                                            title="Remove attachment"
                                          >
                                            <Trash2 className="size-2.5" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="mt-1 text-[9px] text-muted-foreground">
                                      Add photos, PDFs, emails, or other layer files.
                                    </p>
                                  )}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const note = noteDrafts[layer.id] ?? layer.note ?? "";
                                      wb.setLayerNote(layer.id, note);
                                      setNoteFor(null);
                                      toast.success(
                                        note.trim() ? "Layer note saved" : "Layer note cleared",
                                      );
                                    }}
                                    className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"
                                  >
                                    <Save className="size-3" /> Save note
                                  </button>
                                  {layer.note?.trim() && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        wb.setLayerNote(layer.id, "");
                                        setNoteDrafts((current) => ({
                                          ...current,
                                          [layer.id]: "",
                                        }));
                                        setNoteFor(null);
                                        toast.success("Layer note removed");
                                      }}
                                      className="rounded-lg px-2 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/10"
                                    >
                                      Remove note
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setNoteFor(null)}
                                    className="rounded-lg px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </section>
                            )}

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

                            <FeatureSublayers layer={layer} onZoom={zoomTo} />
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

        <div className="mt-3">
          <button
            onClick={() => fileInput.current?.click()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-2 py-2 text-center transition-colors",
              dragging ? "border-primary bg-accent" : "border-border hover:border-primary",
            )}
            title="Add GeoJSON, KML, KMZ, zipped Shapefile, GPX, or CSV data"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <Upload className="size-4 text-primary" />
            )}
            <span className="text-[10px] font-medium">Drop files or click to add data</span>
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

function transferableFeature(feature: Feature): Feature {
  const copy = JSON.parse(JSON.stringify(feature)) as Feature;
  const properties = { ...(copy.properties ?? {}) };
  delete properties["__hidden"];
  return { ...copy, properties };
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
  const [targetLayerId, setTargetLayerId] = useState("__new__");
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
  const checkedIndexes = new Set(
    wb.selectedFeatures
      .filter((selection) => selection.layerId === layer.id)
      .map((selection) => selection.index),
  );
  const targetLayers = wb.layers.filter(
    (candidate) => candidate.id !== layer.id && candidate.source.kind !== "remote",
  );

  const setCheckedIndexes = (indexes: Iterable<number>) => {
    const otherSelections = wb.selectedFeatures.filter(
      (selection) => selection.layerId !== layer.id,
    );
    const layerSelections = Array.from(new Set(indexes))
      .filter((index) => layer.data.features[index])
      .sort((a, b) => a - b)
      .map((index) => ({ layerId: layer.id, index }));
    wb.setSelectedFeatures([...otherSelections, ...layerSelections]);
    wb.setActiveLayer(layer.id);
  };

  const transferChecked = (mode: "copy" | "move") => {
    const indexes = Array.from(checkedIndexes).sort((a, b) => a - b);
    const features = indexes
      .map((index) => layer.data.features[index])
      .filter((feature): feature is Feature => Boolean(feature))
      .map(transferableFeature);
    if (!features.length) return;

    let destinationId = targetLayerId;
    let firstDestinationIndex = 0;
    if (targetLayerId === "__new__") {
      const suggestedName = `${layer.name} selection`;
      const name = window.prompt("Name the new main layer", suggestedName)?.trim();
      if (!name) return;
      const created = wb.addLayer({
        name,
        data: { type: "FeatureCollection", features },
        groupId: wb.derivedLayerGroupId,
        source: {
          kind: "derived",
          sourceLayerId: layer.id,
          query: `${mode === "move" ? "Moved" : "Copied"} checked feature sublayers`,
        },
      });
      destinationId = created.id;
    } else {
      const destination = targetLayers.find((candidate) => candidate.id === targetLayerId);
      if (!destination) return;
      firstDestinationIndex = destination.data.features.length;
      wb.updateLayer(destination.id, {
        data: {
          ...destination.data,
          features: [...destination.data.features, ...features],
        },
      });
    }

    if (mode === "move") {
      if (layer.source.kind === "remote") {
        const moving = new Set(indexes);
        wb.updateLayer(layer.id, {
          data: {
            ...layer.data,
            features: layer.data.features.map((feature, index) =>
              moving.has(index)
                ? {
                    ...feature,
                    properties: { ...(feature.properties ?? {}), __hidden: true },
                  }
                : feature,
            ),
          },
        });
      } else wb.removeFeatures(layer.id, indexes);
    }

    wb.setSelectedFeatures(
      features.map((_, index) => ({
        layerId: destinationId,
        index: firstDestinationIndex + index,
      })),
    );
    wb.setActiveLayer(destinationId);
    const destinationName =
      targetLayerId === "__new__"
        ? "a new main layer"
        : (targetLayers.find((candidate) => candidate.id === destinationId)?.name ?? "the layer");
    toast.success(
      `${features.length} feature${features.length === 1 ? "" : "s"} ${mode === "move" ? "moved" : "copied"}`,
      { description: `Added to ${destinationName}.` },
    );
  };

  const removeChecked = () => {
    const indexes = Array.from(checkedIndexes).sort((a, b) => a - b);
    if (!indexes.length) return;
    const action = layer.source.kind === "remote" ? "hide" : "remove";
    if (
      !window.confirm(
        `${action === "hide" ? "Hide" : "Remove"} ${indexes.length} checked feature${indexes.length === 1 ? "" : "s"}?`,
      )
    )
      return;
    if (layer.source.kind === "remote") {
      const removing = new Set(indexes);
      wb.updateLayer(layer.id, {
        data: {
          ...layer.data,
          features: layer.data.features.map((feature, index) =>
            removing.has(index)
              ? {
                  ...feature,
                  properties: { ...(feature.properties ?? {}), __hidden: true },
                }
              : feature,
          ),
        },
      });
    } else wb.removeFeatures(layer.id, indexes);
    setCheckedIndexes([]);
  };

  return (
    <details className="group rounded-lg border border-border bg-card/70">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1.5 text-[10px] font-semibold">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        Feature sublayers ({layer.data.features.length})
      </summary>
      <div className="space-y-2 border-t border-border p-2">
        {layer.source.kind === "remote" && (
          <RemoteLayerSettings layerId={layer.id} source={layer.source} />
        )}
        <label className="relative block">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a feature or attribute"
            className="w-full rounded-lg border border-border bg-secondary py-1.5 pl-7 pr-2 text-[10px] outline-none focus:border-primary"
          />
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setCheckedIndexes([...checkedIndexes, ...visible.map(({ index }) => index)])
            }
            className="rounded-lg bg-secondary px-2 py-1 text-[9px] font-semibold hover:bg-accent"
          >
            Select shown
          </button>
          <button
            type="button"
            onClick={() => setCheckedIndexes([])}
            disabled={checkedIndexes.size === 0}
            className="rounded-lg px-2 py-1 text-[9px] font-semibold text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            Clear
          </button>
          <span className="num ml-auto text-[9px] text-muted-foreground">
            {checkedIndexes.size} checked
          </span>
        </div>
        {checkedIndexes.size > 0 && (
          <div className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-2">
            <label className="block text-[9px] font-semibold text-muted-foreground">
              Destination main layer
              <select
                value={targetLayerId}
                onChange={(event) => setTargetLayerId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[10px] text-foreground"
              >
                <option value="__new__">+ New layer in default category</option>
                {targetLayers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => transferChecked("copy")}
                className="rounded-lg bg-primary px-1.5 py-1.5 text-[9px] font-semibold text-primary-foreground"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => transferChecked("move")}
                className="rounded-lg bg-secondary px-1.5 py-1.5 text-[9px] font-semibold hover:bg-accent"
              >
                Move
              </button>
              <button
                type="button"
                onClick={() =>
                  onZoom({
                    type: "FeatureCollection",
                    features: Array.from(checkedIndexes)
                      .map((index) => layer.data.features[index])
                      .filter((feature): feature is Feature => Boolean(feature)),
                  })
                }
                className="rounded-lg bg-secondary px-1.5 py-1.5 text-[9px] font-semibold hover:bg-accent"
              >
                Zoom
              </button>
              <button
                type="button"
                onClick={removeChecked}
                className="rounded-lg px-1.5 py-1.5 text-[9px] font-semibold text-destructive hover:bg-destructive/10"
              >
                {layer.source.kind === "remote" ? "Hide" : "Remove"}
              </button>
            </div>
          </div>
        )}
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
                <input
                  type="checkbox"
                  checked={checkedIndexes.has(index)}
                  onChange={(event) => {
                    const next = new Set(checkedIndexes);
                    if (event.target.checked) next.add(index);
                    else next.delete(index);
                    setCheckedIndexes(next);
                  }}
                  aria-label={`Select ${name} for batch actions`}
                  className="size-3 shrink-0 accent-primary"
                />
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
