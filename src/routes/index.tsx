import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";

const Workbench = lazy(() => import("@/components/gis/Workbench"));

const title = "TerraSketch GIS — Friendly Maps, Real GIS Power";
const description =
  "Draw, measure and map in your browser: import GeoJSON, KML, KMZ, Shapefile, GPX and CSV, stream official public data, style layers and export — no login or API keys.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function MapSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto size-10 animate-pulse rounded-xl bg-primary" />
        <p className="mt-3 text-sm font-medium text-foreground">TerraSketch GIS</p>
        <p className="text-xs text-muted-foreground">Warming up the map workbench…</p>
      </div>
    </div>
  );
}

function Index() {
  return (
    <>
      <h1 className="sr-only">TerraSketch GIS map workbench</h1>
      <ClientOnly fallback={<MapSkeleton />}>
        <Suspense fallback={<MapSkeleton />}>
          <Workbench />
        </Suspense>
      </ClientOnly>
    </>
  );
}
