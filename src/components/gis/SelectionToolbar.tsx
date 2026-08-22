import { useMemo, useRef, useState } from "react";
import {
  CopyPlus,
  Database,
  FileUp,
  GitBranchPlus,
  ListPlus,
  MapPinPlus,
  Minus,
  Pentagon,
  Table2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useMapRef } from "@/lib/gis/mapRef";
import { useWorkbench } from "@/lib/gis/store";
import { cn } from "@/lib/utils";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function featureName(properties: Record<string, unknown>, fallback: string): string {
  for (const key of ["NAME", "name", "OWNER_NAME", "owner_name", "Prop_ID", "GEO_ID"]) {
    const value = properties[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return fallback;
}

export function SelectionToolbar({ mobile = false }: { mobile?: boolean }) {
  const wb = useWorkbench();
  const { setTableOpen, setDrawerOpen, setPendingCatalogQuery } = useMapRef();
  const [showField, setShowField] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () =>
      wb.selectedFeatures.flatMap((selection) => {
        const layer = wb.layers.find((item) => item.id === selection.layerId);
        const feature = layer?.data.features[selection.index];
        return layer && feature ? [{ selection, layer, feature }] : [];
      }),
    [wb.layers, wb.selectedFeatures],
  );
  const first = selected[0];
  if (!first) return null;

  const preview = Object.entries(first.feature.properties ?? {})
    .filter(([key]) => !key.startsWith("__") && key !== "ATTACHMENTS")
    .slice(0, 4);

  const createCombinedLayer = () => {
    const layer = wb.addLayer({
      name: `${first.layer.name} · ${selected.length} selected`,
      groupId: first.layer.groupId,
      source: {
        kind: "derived",
        sourceLayerId: first.layer.id,
        query: `${selected.length} selected features`,
      },
      data: {
        ...EMPTY_FC,
        features: selected.map(({ feature }) => structuredClone(feature)),
      },
      style: first.layer.style,
    });
    wb.setSelectedFeatures([]);
    toast.success(`${layer.name} created`);
  };

  const createSeparateLayers = () => {
    if (selected.length > 25) {
      toast.error("Select 25 or fewer features to create one layer per feature");
      return;
    }
    selected.forEach(({ layer, feature }, index) => {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      wb.addLayer({
        name: featureName(properties, `${layer.name} · feature ${index + 1}`),
        groupId: layer.groupId,
        source: { kind: "derived", sourceLayerId: layer.id, query: "Selected feature" },
        data: { ...EMPTY_FC, features: [structuredClone(feature)] },
        style: layer.style,
      });
    });
    wb.setSelectedFeatures([]);
    toast.success(`${selected.length} separate layer${selected.length === 1 ? "" : "s"} created`);
  };

  const addField = () => {
    const key = fieldName.trim();
    if (!key) {
      toast.error("Enter a field name");
      return;
    }
    for (const { selection } of selected) {
      wb.updateFeatureProperties(selection.layerId, selection.index, { [key]: fieldValue });
    }
    toast.success(`${key} added to ${selected.length} feature${selected.length === 1 ? "" : "s"}`);
    setFieldName("");
    setFieldValue("");
    setShowField(false);
  };

  const attachFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Attachments must be 2 MB or smaller");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    for (const { selection, feature } of selected) {
      const current = (feature.properties ?? {})["ATTACHMENTS"];
      const attachments = Array.isArray(current) ? current : [];
      wb.updateFeatureProperties(selection.layerId, selection.index, {
        ATTACHMENTS: [
          ...attachments,
          {
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            dataUrl,
            addedAt: new Date().toISOString(),
          },
        ],
      });
    }
    toast.success(
      `${file.name} attached to ${selected.length} feature${selected.length === 1 ? "" : "s"}`,
    );
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section
      className={cn(
        "panel-surface pointer-events-auto absolute left-1/2 z-30 w-[min(94vw,760px)] -translate-x-1/2 rounded-2xl p-2 shadow-float",
        mobile ? "bottom-20" : "bottom-4",
      )}
      aria-label="Selected feature actions"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 px-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              {selected.length} selected
            </span>
            <span className="truncate text-xs font-semibold">{first.layer.name}</span>
          </div>
          <div className="mt-1 flex gap-x-3 overflow-hidden text-[10px] text-muted-foreground">
            {preview.map(([key, value]) => (
              <span key={key} className="max-w-40 truncate">
                <strong>{key}:</strong>{" "}
                {typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => wb.setSelectedFeatures([])}
          className="rounded-lg p-1.5 hover:bg-accent"
          aria-label="Clear feature selection"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
        <Action
          icon={<Table2 />}
          label="Attributes"
          onClick={() => {
            wb.setActiveLayer(first.layer.id);
            setTableOpen(true);
          }}
        />
        <Action icon={<CopyPlus />} label="New layer" onClick={createCombinedLayer} />
        {selected.length > 1 && (
          <Action icon={<GitBranchPlus />} label="Split layers" onClick={createSeparateLayers} />
        )}
        <Action
          icon={<ListPlus />}
          label="Add field"
          onClick={() => setShowField((value) => !value)}
        />
        <Action icon={<FileUp />} label="Attach file" onClick={() => fileRef.current?.click()} />
        <Action
          icon={<Database />}
          label="Find data"
          onClick={() => {
            setPendingCatalogQuery(first.layer.name);
            setDrawerOpen(true);
          }}
        />
        <Action icon={<Pentagon />} label="Draw area" onClick={() => wb.setDrawMode("polygon")} />
        <Action icon={<Minus />} label="Draw line" onClick={() => wb.setDrawMode("line")} />
        <Action icon={<MapPinPlus />} label="Add point" onClick={() => wb.setDrawMode("point")} />
      </div>

      {showField && (
        <div className="mt-2 flex gap-1 border-t border-border pt-2">
          <input
            value={fieldName}
            onChange={(event) => setFieldName(event.target.value)}
            placeholder="Field name"
            aria-label="New attribute field name"
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <input
            value={fieldValue}
            onChange={(event) => setFieldValue(event.target.value)}
            placeholder="Value"
            aria-label="New attribute value"
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <button
            onClick={addField}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Apply
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.txt,.csv"
        className="hidden"
        onChange={(event) => void attachFile(event.target.files?.[0])}
      />
    </section>
  );
}

function Action({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-xl bg-secondary px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
      title={label}
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      {label}
    </button>
  );
}
