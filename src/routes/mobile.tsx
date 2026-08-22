import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";

const MobileWorkbench = lazy(() => import("@/components/gis/MobileWorkbench"));

export const Route = createFileRoute("/mobile")({
  head: () => ({
    meta: [
      { title: "LandDraft Mobile Map" },
      {
        name: "description",
        content:
          "A clean field map for signed-in projects, public data, GPS feature collection, layer editing and map or GIS data exports.",
      },
    ],
  }),
  component: MobileRoute,
});

function Loading() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background text-sm font-medium">
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
