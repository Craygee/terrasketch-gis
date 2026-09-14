import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import { AuthGate } from "@/lib/auth";
import { WorkbenchProvider } from "@/lib/gis/store";
import { MapRefProvider } from "@/lib/gis/mapRef";
import { RemoteLayerManager } from "@/components/gis/RemoteLayerManager";

const WaterWorkspace = lazy(() =>
  import("@/components/water/WaterWorkspace").then((module) => ({
    default: module.WaterWorkspace,
  })),
);

export const Route = createFileRoute("/water")({
  head: () => ({
    meta: [
      { title: "Water & Hydrogeology — LandDraft" },
      {
        name: "description",
        content: "Optional evidence-based groundwater and surface-water research workspace.",
      },
    ],
  }),
  component: WaterRoute,
});

function Loading() {
  return (
    <div className="app-viewport flex items-center justify-center bg-background">
      <div className="text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <LandDraftMark className="size-6" />
        </span>
        <p className="mt-3 text-sm font-semibold">Opening Water</p>
        <p className="text-xs text-muted-foreground">Connecting the map and water sources…</p>
      </div>
    </div>
  );
}

function WaterRoute() {
  return (
    <ClientOnly fallback={<Loading />}>
      <AuthGate>
        <WorkbenchProvider>
          <MapRefProvider>
            <Suspense fallback={<Loading />}>
              <WaterWorkspace />
              <RemoteLayerManager />
              <Toaster
                mobileOffset={{
                  bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
                  left: ".5rem",
                  right: ".5rem",
                }}
              />
            </Suspense>
          </MapRefProvider>
        </WorkbenchProvider>
      </AuthGate>
    </ClientOnly>
  );
}
