import { useState } from "react";
import { Crosshair, MapPinned, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import type { MapViewState } from "@/lib/gis/types";
import { cn } from "@/lib/utils";

export function ProjectAreaControl({ align = "left" }: { align?: "left" | "right" }) {
  const wb = useWorkbench();
  const { map } = useMapRef();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!wb.canEditProject) return null;

  const currentView = (): MapViewState | null => {
    if (!map) return null;
    const center = map.getCenter();
    return {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
  };

  const saveArea = async () => {
    const view = currentView();
    if (!view) return;
    setSaving(true);
    try {
      await wb.setProjectArea(view);
      setOpen(false);
      toast.success(wb.projectArea ? "Project area updated" : "Project area set", {
        description: "This location and zoom will open first for this project.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Project area could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const resetArea = async () => {
    setSaving(true);
    try {
      await wb.setProjectArea(null);
      setOpen(false);
      toast.success("Project area reset", {
        description: "LandDraft will open this project at its most recently viewed location.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Project area could not be reset");
    } finally {
      setSaving(false);
    }
  };

  const returnToArea = () => {
    if (!map || !wb.projectArea) return;
    map.easeTo({ ...wb.projectArea, duration: 450 });
    setOpen(false);
  };

  return (
    <div className="relative pointer-events-auto" data-tour="project-area">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={wb.projectArea ? "Project area is set" : "Set project area"}
        title={
          wb.projectArea
            ? "Project area is set — open options"
            : "Save this location and zoom as the project area"
        }
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:bg-accent",
          wb.projectArea && "border-primary bg-primary/10 text-primary",
        )}
      >
        <MapPinned className="size-4" />
        {wb.projectArea && (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <div
          className={cn(
            "float-surface absolute top-full z-50 mt-2 w-64 rounded-2xl p-3 text-xs",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="font-semibold">Project area</div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            {wb.projectArea
              ? "This saved view opens first whenever you return to this project."
              : "No preferred area is set. The project currently opens at its last viewed location."}
          </p>
          <button
            type="button"
            onClick={() => void saveArea()}
            disabled={!map || saving}
            className="mt-3 flex w-full items-center gap-2 rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Crosshair className="size-3.5" />
            {saving ? "Saving…" : wb.projectArea ? "Update from current view" : "Set current view"}
          </button>
          {wb.projectArea && (
            <div className="mt-1 grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={returnToArea}
                disabled={!map || saving}
                className="rounded-xl bg-secondary px-2 py-2 font-semibold disabled:opacity-50"
              >
                Go to area
              </button>
              <button
                type="button"
                onClick={() => void resetArea()}
                disabled={saving}
                className="flex items-center justify-center gap-1 rounded-xl border border-border px-2 py-2 font-semibold text-muted-foreground disabled:opacity-50"
              >
                <RotateCcw className="size-3" /> Reset
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
