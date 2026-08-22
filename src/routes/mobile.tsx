import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";

const MobileWorkbench = lazy(() => import("@/components/gis/MobileWorkbench"));

export const Route = createFileRoute("/mobile")({
  head: () => ({
    meta: [
      { title: "TerraSketch Mobile Map" },
      {
        name: "description",
        content:
          "A clean field map for viewing public data, collecting GPS features, editing layers and exporting PDF maps.",
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
