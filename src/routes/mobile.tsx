import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";

const MobileWorkbench = lazy(() => import("@/components/gis/MobileWorkbench"));

export const Route = createFileRoute("/mobile")({
  head: () => ({
    meta: [
      { title: "LandDraft Field Map" },
      {
        name: "description",
        content:
          "A clean mobile field map for GPS points, walking or driving tracks, parcel inspection, directions, signed-in projects, public data and GIS exports.",
      },
    ],
  }),
  component: MobileRoute,
});

function Loading() {
  return (
    <div className="app-viewport flex items-center justify-center bg-background text-sm font-medium">
      Loading field map…
    </div>
  );
}

function MobileRoute() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <MobileWorkbench />
      </Suspense>
    </ClientOnly>
  );
}
