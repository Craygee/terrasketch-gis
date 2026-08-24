import { useMemo, useState } from "react";
import { FolderPlus, Layers3, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { Feature, Geometry } from "geojson";

import { useMapRef } from "@/lib/gis/mapRef";
import { useWorkbench } from "@/lib/gis/store";
import { cn } from "@/lib/utils";

type DestinationMode = "new" | "existing";

const geometryFamily = (geometry: Geometry) =>
  geometry.type.includes("Polygon")
    ? "polygon"
    : geometry.type.includes("LineString")
      ? "line"
      : geometry.type.includes("Point")
        ? "point"
        : "other";

const namedFeature = (feature: Feature, name: string) => ({
  ...structuredClone(feature),
  properties: { ...(feature.properties ?? {}), ...(name.trim() ? { NAME: name.trim() } : {}) },
});

export function FeatureDestinationDialog() {
  const wb = useWorkbench();
  const { pendingFeatureSave: pending, setPendingFeatureSave } = useMapRef();
  const [mode, setMode] = useState<DestinationMode>("new");
  const [layerName, setLayerName] = useState("");
  const [featureName, setFeatureName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [existingLayerId, setExistingLayerId] = useState("");

  const compatibleLayers = useMemo(() => {
    if (!pending) return [];
    const families = new Set(pending.features.map((feature) => geometryFamily(feature.geometry)));
    return wb.layers.filter((layer) => {
      if (layer.source.kind === "remote") return false;
      if (layer.data.features.length === 0) return true;
      const layerFamilies = new Set(
        layer.data.features.slice(0, 100).map((feature) => geometryFamily(feature.geometry)),
      );
      return [...families].every((family) => layerFamilies.has(family));
    });
  }, [pending, wb.layers]);

  if (!pending) return null;
  const effectiveLayerName = layerName || pending.suggestedLayerName;
  const effectiveFeatureName = featureName || pending.suggestedFeatureName || "";
  const effectiveGroupId = groupId || pending.defaultGroupId;

  const close = () => {
    setPendingFeatureSave(null);
    setMode("new");
    setLayerName("");
    setFeatureName("");
    setGroupId("");
    setNewGroupName("");
    setExistingLayerId("");
  };

  const save = () => {
    const features = pending.features.map((feature, index) =>
      namedFeature(
        feature,
        pending.features.length === 1
          ? effectiveFeatureName
          : pending.separate
            ? String(feature.properties?.["NAME"] ?? `${effectiveLayerName} ${index + 1}`)
            : "",
      ),
    );
    if (mode === "existing" && !pending.separate) {
      const target = compatibleLayers.find((layer) => layer.id === existingLayerId);
      if (!target) {
        toast.error("Choose a compatible destination layer");
        return;
      }
      features.forEach((feature) => wb.appendFeature(target.id, feature as never));
      wb.setActiveLayer(target.id);
      toast.success(
        `${features.length} feature${features.length === 1 ? "" : "s"} added to ${target.name}`,
      );
      close();
      return;
    }
    const targetGroupId = newGroupName.trim() ? wb.addGroup(newGroupName.trim()) : effectiveGroupId;
    if (pending.separate) {
      features.forEach((feature, index) =>
        wb.addLayer({
          name: String(feature.properties?.["NAME"] ?? `${effectiveLayerName} ${index + 1}`),
          groupId: targetGroupId,
          source: pending.source,
          ...(pending.style ? { style: pending.style } : {}),
          data: { type: "FeatureCollection", features: [feature as never] },
        }),
      );
      toast.success(`${features.length} layers created`);
    } else {
      const layer = wb.addLayer({
        name: effectiveLayerName.trim() || "New layer",
        groupId: targetGroupId,
        source: pending.source,
        ...(pending.style ? { style: pending.style } : {}),
        data: { type: "FeatureCollection", features: features as never },
      });
      toast.success(`${layer.name} created`);
    }
    close();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-[2px]">
      <section
        className="panel-surface w-full max-w-md rounded-3xl p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Layers3 className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold">
              Save {pending.features.length > 1 ? "features" : "feature"}
            </h2>
            <p className="text-[10px] text-muted-foreground">Choose where this geometry belongs.</p>
          </div>
          <button
            onClick={close}
            className="ml-auto rounded-lg p-2 hover:bg-accent"
            aria-label="Cancel save"
            title="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>

        {!pending.separate && (
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
            <button
              onClick={() => setMode("new")}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-semibold",
                mode === "new" && "bg-card shadow-sm",
              )}
            >
              <FolderPlus className="mr-1 inline size-3.5" /> New layer
            </button>
            <button
              onClick={() => setMode("existing")}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-semibold",
                mode === "existing" && "bg-card shadow-sm",
              )}
            >
              <Plus className="mr-1 inline size-3.5" /> Existing layer
            </button>
          </div>
        )}

        {pending.features.length === 1 && (
          <label className="mt-3 block text-[10px] font-medium text-muted-foreground">
            Feature name
            <input
              value={featureName}
              onChange={(event) => setFeatureName(event.target.value)}
              placeholder={pending.suggestedFeatureName ?? "Feature name"}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
          </label>
        )}

        {mode === "new" || pending.separate ? (
          <div className="mt-3 space-y-3">
            {!pending.separate && (
              <label className="block text-[10px] font-medium text-muted-foreground">
                Layer name
                <input
                  value={layerName}
                  onChange={(event) => setLayerName(event.target.value)}
                  placeholder={pending.suggestedLayerName}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                />
              </label>
            )}
            <label className="block text-[10px] font-medium text-muted-foreground">
              Layer group
              <select
                value={effectiveGroupId}
                onChange={(event) => setGroupId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground"
              >
                {wb.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] font-medium text-muted-foreground">
              Or create a new group
              <input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="Optional group name"
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>
        ) : (
          <label className="mt-3 block text-[10px] font-medium text-muted-foreground">
            Compatible layer
            <select
              value={existingLayerId}
              onChange={(event) => setExistingLayerId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground"
            >
              <option value="">Choose layer</option>
              {compatibleLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                </option>
              ))}
            </select>
            {compatibleLayers.length === 0 && (
              <span className="mt-1 block text-[9px]">
                No editable layer currently has compatible geometry.
              </span>
            )}
          </label>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-xl px-4 py-2 text-xs font-semibold hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Save feature
          </button>
        </div>
      </section>
    </div>
  );
}
