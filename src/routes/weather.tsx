import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { LandDraftMark } from "@/components/brand/LandDraftMark";
import { AuthGate } from "@/lib/auth";
import { WorkbenchProvider } from "@/lib/gis/store";
import { MapRefProvider } from "@/lib/gis/mapRef";
import { RemoteLayerManager } from "@/components/gis/RemoteLayerManager";

const WeatherWorkspace = lazy(() =>
  import("@/components/weather/WeatherWorkspace").then((module) => ({
    default: module.WeatherWorkspace,
  })),
);

export const Route = createFileRoute("/weather")({
  head: () => ({
    meta: [
      { title: "Weather & Meteorology — LandDraft" },
      {
        name: "description",
        content:
          "Optional map-based weather, radar, severe-weather, forecasting, and infrastructure-risk workspace.",
      },
    ],
  }),
  component: WeatherRoute,
});

function Loading() {
  return (
    <div className="app-viewport flex items-center justify-center bg-background">
      <div className="text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <LandDraftMark className="size-6" />
        </span>
        <p className="mt-3 text-sm font-semibold">Opening Weather</p>
        <p className="text-xs text-muted-foreground">Connecting the map and weather sources…</p>
      </div>
    </div>
  );
}

function WeatherRoute() {
  return (
    <ClientOnly fallback={<Loading />}>
      <AuthGate>
        <WorkbenchProvider>
          <MapRefProvider>
            <Suspense fallback={<Loading />}>
              <WeatherWorkspace />
              <RemoteLayerManager />
              <Toaster />
            </Suspense>
          </MapRefProvider>
        </WorkbenchProvider>
      </AuthGate>
    </ClientOnly>
  );
}
