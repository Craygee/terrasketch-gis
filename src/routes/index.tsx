import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { LandDraftMark } from "@/components/brand/LandDraftMark";

const Workbench = lazy(() => import("@/components/gis/Workbench"));

const title = "LandDraft — Friendly Maps, Real GIS Power";
const description =
  "Create signed-in GIS projects with autosave and save history: draw, measure, import GIS files, stream public data, style layers and export maps or data.";

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
        <div className="mx-auto flex size-10 animate-pulse items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <LandDraftMark className="size-6" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">LandDraft</p>
        <p className="text-xs text-muted-foreground">Warming up the map workbench…</p>
      </div>
    </div>
  );
}

function Index() {
  return (
    <>
      <h1 className="sr-only">LandDraft map workbench</h1>
      <ClientOnly fallback={<MapSkeleton />}>
        <Suspense fallback={<MapSkeleton />}>
          <Workbench />
        </Suspense>
      </ClientOnly>
    </>
  );
}
