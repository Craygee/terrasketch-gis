import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import { AuthGate } from "@/lib/auth";
import { WorkbenchProvider } from "@/lib/gis/store";
import { MapRefProvider } from "@/lib/gis/mapRef";
import { RemoteLayerManager } from "@/components/gis/RemoteLayerManager";

const PipelineWorkspace = lazy(() =>
  import("@/components/pipeline/PipelineWorkspace").then((module) => ({
    default: module.PipelineWorkspace,
  })),
);

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline Engineering & Estimating — LandDraft" },
      {
        name: "description",
        content:
          "Optional map-based preliminary pipeline routing, hydraulic screening, quantities and estimating workspace.",
      },
    ],
  }),
  component: PipelineRoute,
});

function Loading() {
  return (
    <div className="app-viewport flex items-center justify-center bg-background">
      <div className="text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <LandDraftMark className="size-6" />
        </span>
        <p className="mt-3 text-sm font-semibold">Opening Pipeline Engineering</p>
        <p className="text-xs text-muted-foreground">Loading the synchronized model workspace…</p>
      </div>
    </div>
  );
}

function PipelineRoute() {
  return (
    <ClientOnly fallback={<Loading />}>
      <AuthGate>
        <WorkbenchProvider>
          <MapRefProvider>
            <Suspense fallback={<Loading />}>
              <PipelineWorkspace />
              <RemoteLayerManager />
              <Toaster />
            </Suspense>
          </MapRefProvider>
        </WorkbenchProvider>
      </AuthGate>
    </ClientOnly>
  );
}
