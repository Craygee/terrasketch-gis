import { useMemo, useState } from "react";
import { Search, X, Database, Loader2, Plus, Link2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { categories, searchCatalog, type CatalogEntry } from "@/lib/gis/catalog";
import { fetchRemoteGeoJSON } from "@/lib/gis/arcgis";
import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { cn } from "@/lib/utils";

export function DataDrawer() {
  const { drawerOpen, setDrawerOpen, map, pendingCatalogQuery } = useMapRef();
  const wb = useWorkbench();
  const [query, setQuery] = useState(pendingCatalogQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState("");

  const results = useMemo(() => searchCatalog(query, category), [query, category]);

  const viewportBbox = (): [number, number, number, number] | undefined => {
    if (!map) return undefined;
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  };

  const load = async (entry: CatalogEntry) => {
    setLoadingId(entry.id);
    try {
      const bboxValue = entry.requiresViewport ? viewportBbox() : undefined;
      const data = await fetchRemoteGeoJSON(entry.url, {
        ...(bboxValue ? { bbox: bboxValue } : {}),
        maxFeatures: 3000,
      });
      if (data.features.length === 0) {
        toast.warning(`No ${entry.name} features in this view`, {
          description: "Pan or zoom to an area that has coverage, then try again.",
        });
        return;
      }
      wb.addLayer({
        name: entry.name,
        data,
        groupId: "public",
        source: { kind: "remote", url: entry.url, catalogId: entry.id, attribution: entry.agency },
        style: entry.geometry === "line" ? { fillOpacity: 0, strokeWidth: 2.5 } : {},
      });
      toast.success(`${entry.name} added`, {
        description: `${data.features.length} features from ${entry.agency}`,
      });
      setDrawerOpen(false);
    } catch (err) {
      toast.error(`Couldn't load ${entry.name}`, {
        description: err instanceof Error ? err.message : "The service did not respond",
      });
    } finally {
      setLoadingId(null);
    }
  };

  const loadCustom = async () => {
    const url = customUrl.trim();
    if (!url) return;
    setLoadingId("custom");
    try {
      const bboxValue = viewportBbox();
      const data = await fetchRemoteGeoJSON(url, {
        ...(bboxValue ? { bbox: bboxValue } : {}),
        maxFeatures: 3000,
      });
      wb.addLayer({
        name: url.split("/").filter(Boolean).slice(-3).join("/"),
        data,
        groupId: "public",
        source: { kind: "remote", url },
      });
      toast.success(`Connected · ${data.features.length} features`);
      setCustomUrl("");
      setDrawerOpen(false);
    } catch (err) {
      toast.error("Connection failed", {
        description: err instanceof Error ? err.message : "Check the service URL",
      });
    } finally {
      setLoadingId(null);
    }
  };

  if (!drawerOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex">
      <button
        className="flex-1 bg-foreground/20 backdrop-blur-[2px]"
        aria-label="Close data drawer"
        onClick={() => setDrawerOpen(false)}
      />
      <aside className="panel-surface flex h-full w-full max-w-md flex-col overflow-hidden md:rounded-l-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Database className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Public data library</h2>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close"
            className="ml-auto rounded-lg p-1 hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roads, pipelines, counties, tracts…"
              aria-label="Search public data"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <Chip active={category === null} onClick={() => setCategory(null)}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-2">
            {results.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{entry.name}</div>
                    <div className="text-[11px] font-medium text-primary">{entry.agency}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                      <span className="rounded-full bg-secondary px-2 py-0.5">
                        {entry.category}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5">
                        {entry.geometry}
                      </span>
                      {entry.requiresViewport && (
                        <span className="rounded-full bg-secondary px-2 py-0.5">
                          loads current view
                        </span>
                      )}
                      <span className="rounded-full bg-secondary px-2 py-0.5">{entry.license}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => void load(entry)}
                    disabled={loadingId === entry.id}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {loadingId === entry.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Add
                  </button>
                </div>
              </div>
            ))}
            {results.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No datasets match that search.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Link2 className="size-3.5 text-primary" /> Connect any service
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Paste a FeatureServer/MapServer layer URL or a direct GeoJSON URL. Compatible feature
              services are converted into GeoJSON queries automatically.
            </p>
            <div className="mt-2 flex gap-1">
              <input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://…/FeatureServer/0"
                aria-label="Service URL"
                className="num w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] outline-none focus:border-primary"
              />
              <button
                onClick={() => void loadCustom()}
                disabled={loadingId === "custom"}
                className="rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
              >
                {loadingId === "custom" ? <Loader2 className="size-3.5 animate-spin" /> : "Load"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 rounded-xl bg-secondary/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-clay" />
            <p>
              Public data disclaimer: datasets are streamed live from the publishing agency and may
              be incomplete, out of date or generalized. Nothing here is a survey or a legal
              boundary determination — confirm ownership, easements and property lines with the
              county records office and a licensed surveyor.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
