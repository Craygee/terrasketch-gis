import { useEffect, useMemo, useState } from "react";
import {
  Search,
  X,
  Database,
  Loader2,
  Plus,
  Link2,
  ShieldAlert,
  ExternalLink,
  Radio,
  Clock3,
  SlidersHorizontal,
  Library,
} from "lucide-react";
import { toast } from "sonner";

import { categories, searchCatalog, US_STATES, type CatalogEntry } from "@/lib/gis/catalog";
import { fetchArcgisFields, fetchRemoteGeoJSON, type ArcgisField } from "@/lib/gis/arcgis";
import {
  dataGovDiscoveryUrl,
  searchRepositories,
  type PublicRepository,
} from "@/lib/gis/repositories";
import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { cn } from "@/lib/utils";

const catalogLayerStyle = (entry: CatalogEntry) => {
  if (entry.id === "tx-parcels") return { fillOpacity: 0, strokeWidth: 1.5 };
  if (entry.geometry === "line") return { fillOpacity: 0, strokeWidth: 2.5 };
  return {};
};

export function DataDrawer() {
  const { drawerOpen, setDrawerOpen, map, pendingCatalogQuery } = useMapRef();
  const wb = useWorkbench();
  const [query, setQuery] = useState(pendingCatalogQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [county, setCounty] = useState("");
  const [showStates, setShowStates] = useState(false);
  const [mode, setMode] = useState<"layers" | "repositories">("layers");
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [fieldOptions, setFieldOptions] = useState<Record<string, ArcgisField[]>>({});
  const [selectedFields, setSelectedFields] = useState<Record<string, string[]>>({});

  const results = useMemo(
    () => searchCatalog(query, category, wb.selectedStates),
    [query, category, wb.selectedStates],
  );
  const repositories = useMemo(
    () => searchRepositories(query, wb.selectedStates),
    [query, wb.selectedStates],
  );

  useEffect(() => {
    if (drawerOpen) setQuery(pendingCatalogQuery);
  }, [drawerOpen, pendingCatalogQuery]);

  const viewportBbox = (): [number, number, number, number] | undefined => {
    if (!map) return undefined;
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  };

  const load = async (entry: CatalogEntry) => {
    if (!entry.url) {
      if (entry.sourcePage) window.open(entry.sourcePage, "_blank", "noopener,noreferrer");
      return;
    }
    const existing = wb.layers.find(
      (layer) => layer.source.kind === "remote" && layer.source.catalogId === entry.id,
    );
    if (existing) {
      wb.updateLayer(existing.id, { visible: true });
      wb.setActiveLayer(existing.id);
      toast.success(`${entry.name} is ready`, {
        description:
          entry.minZoom && map && map.getZoom() < entry.minZoom
            ? `It will appear automatically at zoom ${entry.minZoom} or closer.`
            : "The existing layer was made visible.",
      });
      setDrawerOpen(false);
      return;
    }
    const where =
      entry.countyField && county.trim()
        ? `${entry.countyField}='${county.trim().replaceAll("'", "''")}'`
        : undefined;
    const effectiveMinZoom =
      entry.minZoom ?? (entry.geometry === "point" ? 7 : entry.geometry === "line" ? 5 : 5);
    const source = {
      kind: "remote" as const,
      url: entry.url,
      catalogId: entry.id,
      attribution: entry.agency,
      ...(where ? { where } : {}),
      requiresViewport: true,
      minZoom: effectiveMinZoom,
      ...(selectedFields[entry.id]?.length ? { outFields: selectedFields[entry.id] } : {}),
    };
    wb.addLayer({
      name: entry.name,
      data: { type: "FeatureCollection", features: [] },
      groupId: "public",
      source,
      style: catalogLayerStyle(entry),
    });
    toast.success(`${entry.name} added`, {
      description:
        map && map.getZoom() < effectiveMinZoom
          ? `It will load automatically when you reach zoom ${effectiveMinZoom} or closer.`
          : "Loading the visible map area now.",
    });
    setDrawerOpen(false);
  };

  const inspectFields = async (entry: CatalogEntry) => {
    if (!entry.url) return;
    if (inspectId === entry.id) {
      setInspectId(null);
      return;
    }
    setInspectId(entry.id);
    if (fieldOptions[entry.id]) return;
    setLoadingId(`fields:${entry.id}`);
    try {
      const fields = await fetchArcgisFields(entry.url);
      setFieldOptions((current) => ({ ...current, [entry.id]: fields }));
      setSelectedFields((current) => ({
        ...current,
        [entry.id]: fields.map((field) => field.name),
      }));
    } catch (error) {
      toast.error("Attributes could not be inspected", {
        description:
          error instanceof Error ? error.message : "The publisher did not expose a schema",
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
        maxFeatures: 2000,
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
        title="Close the public data library"
        onClick={() => setDrawerOpen(false)}
      />
      <aside className="panel-surface flex h-full w-full max-w-md flex-col overflow-hidden md:rounded-l-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Database className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Public data library</h2>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close"
            title="Close the public data library"
            className="ml-auto rounded-lg p-1 hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2 border-b border-border px-4 py-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
            <button
              onClick={() => setMode("layers")}
              className={cn(
                "rounded-lg px-2 py-1.5 text-xs font-medium",
                mode === "layers" && "bg-card text-foreground shadow-sm",
              )}
            >
              Ready-to-add layers
            </button>
            <button
              onClick={() => setMode("repositories")}
              className={cn(
                "rounded-lg px-2 py-1.5 text-xs font-medium",
                mode === "repositories" && "bg-card text-foreground shadow-sm",
              )}
            >
              Search repositories
            </button>
          </div>
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
          {mode === "layers" && (
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
          )}
          <button
            onClick={() => setShowStates((value) => !value)}
            className="w-full rounded-xl bg-secondary px-3 py-2 text-left text-xs font-medium"
          >
            Project coverage · {wb.selectedStates.join(", ")}{" "}
            <span className="float-right text-muted-foreground">change</span>
          </button>
          {showStates && (
            <div className="max-h-28 overflow-y-auto rounded-xl border border-border bg-card p-2">
              <div className="grid grid-cols-8 gap-1">
                {US_STATES.map((state) => {
                  const active = wb.selectedStates.includes(state);
                  return (
                    <button
                      key={state}
                      onClick={() =>
                        wb.setSelectedStates(
                          active
                            ? wb.selectedStates.filter((value) => value !== state)
                            : [...wb.selectedStates, state],
                        )
                      }
                      className={cn(
                        "rounded px-1 py-1 text-[10px]",
                        active ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      {state}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                State-specific results follow this project coverage; nationwide sources remain
                available.
              </p>
            </div>
          )}
          {mode === "repositories" && (
            <input
              value={county}
              onChange={(event) => setCounty(event.target.value)}
              placeholder="Optional county, borough or parish"
              aria-label="County repository filter"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none focus:border-primary"
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {mode === "layers" ? (
            <div className="space-y-2">
              {results.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{entry.name}</div>
                      <div className="text-[11px] font-medium text-primary">{entry.agency}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
                      {entry.countyField && (
                        <input
                          value={county}
                          onChange={(event) => setCounty(event.target.value)}
                          placeholder="Optional county name, e.g. Travis"
                          aria-label="Parcel county filter"
                          className="mt-2 w-full rounded-lg border border-border bg-secondary/50 px-2 py-1 text-[11px] outline-none focus:border-primary"
                        />
                      )}
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                        <span className="rounded-full bg-secondary px-2 py-0.5">
                          {entry.category}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5">
                          {entry.geometry}
                        </span>
                        {entry.url && (
                          <span className="rounded-full bg-secondary px-2 py-0.5">
                            loads current view
                          </span>
                        )}
                        <span
                          className={cn(
                            "flex items-center gap-1 rounded-full px-2 py-0.5",
                            entry.connection === "live"
                              ? "bg-accent text-accent-foreground"
                              : "bg-secondary",
                          )}
                        >
                          {entry.connection === "live" ? (
                            <Radio className="size-2.5" />
                          ) : (
                            <Clock3 className="size-2.5" />
                          )}
                          {entry.connection}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5">
                          {entry.updateCadence}
                        </span>
                        {entry.url && (
                          <span className="rounded-full bg-secondary px-2 py-0.5">
                            zoom {entry.minZoom ?? (entry.geometry === "point" ? 7 : 5)}+
                          </span>
                        )}
                        <span className="rounded-full bg-secondary px-2 py-0.5">
                          {entry.license}
                        </span>
                      </div>
                      {entry.url && (
                        <button
                          onClick={() => void inspectFields(entry)}
                          className="mt-2 flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                        >
                          {loadingId === `fields:${entry.id}` ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <SlidersHorizontal className="size-3" />
                          )}
                          {inspectId === entry.id
                            ? "Hide import options"
                            : "Choose attributes to import"}
                        </button>
                      )}
                      {inspectId === entry.id && fieldOptions[entry.id] && (
                        <AttributePicker
                          fields={fieldOptions[entry.id] ?? []}
                          selected={selectedFields[entry.id] ?? []}
                          onChange={(fields) =>
                            setSelectedFields((current) => ({ ...current, [entry.id]: fields }))
                          }
                        />
                      )}
                    </div>
                    <button
                      onClick={() => void load(entry)}
                      disabled={
                        loadingId === entry.id ||
                        Boolean(
                          fieldOptions[entry.id]?.length && selectedFields[entry.id]?.length === 0,
                        )
                      }
                      className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {loadingId === entry.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : entry.url ? (
                        <Plus className="size-3.5" />
                      ) : (
                        <ExternalLink className="size-3.5" />
                      )}
                      {entry.url ? "Add" : "Source"}
                    </button>
                  </div>
                  {entry.sourcePage && entry.url && (
                    <a
                      href={entry.sourcePage}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" /> Source details
                    </a>
                  )}
                </div>
              ))}
              {results.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No datasets match that search.
                </p>
              )}
            </div>
          ) : (
            <RepositoryResults
              repositories={repositories}
              query={query}
              states={wb.selectedStates}
              county={county}
            />
          )}

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

function AttributePicker({
  fields,
  selected,
  onChange,
}: {
  fields: ArcgisField[];
  selected: string[];
  onChange: (fields: string[]) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-border bg-secondary/50 p-2">
      <div className="flex items-center justify-between text-[10px] font-medium">
        <span>
          {selected.length} of {fields.length} attributes
        </span>
        <span className="flex gap-2">
          <button
            onClick={() => onChange(fields.map((field) => field.name))}
            className="text-primary hover:underline"
          >
            All
          </button>
          <button onClick={() => onChange([])} className="text-primary hover:underline">
            None
          </button>
        </span>
      </div>
      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg bg-card p-2">
        {fields.map((field) => (
          <label key={field.name} className="flex items-start gap-2 text-[10px]">
            <input
              type="checkbox"
              checked={selected.includes(field.name)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, field.name]
                    : selected.filter((name) => name !== field.name),
                )
              }
              className="mt-0.5 accent-primary"
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{field.alias}</span>
              <span className="num block truncate text-[9px] text-muted-foreground">
                {field.name}
              </span>
            </span>
          </label>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="mt-1 text-[9px] text-destructive">
          Select at least one attribute before adding.
        </p>
      )}
    </div>
  );
}

function RepositoryResults({
  repositories,
  query,
  states,
  county,
}: {
  repositories: PublicRepository[];
  query: string;
  states: string[];
  county: string;
}) {
  return (
    <div className="space-y-2">
      <a
        href={dataGovDiscoveryUrl(query, states, county)}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-xl bg-primary p-3 text-primary-foreground hover:opacity-90"
      >
        <Search className="size-4" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">Search the full government catalog</span>
          <span className="block truncate text-[10px] opacity-80">
            {query || "All geospatial data"} · {states.join(", ")}
            {county ? ` · ${county}` : ""}
          </span>
        </span>
        <ExternalLink className="size-3.5" />
      </a>
      {repositories.map((repository) => (
        <a
          key={repository.id}
          href={repository.url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-xl border border-border bg-card p-3 hover:border-primary"
        >
          <div className="flex items-start gap-2">
            <Library className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{repository.name}</div>
              <div className="text-[11px] font-medium text-primary">{repository.agency}</div>
              <p className="mt-1 text-xs text-muted-foreground">{repository.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                  {repository.kind}
                </span>
                {repository.topics.slice(0, 4).map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
          </div>
        </a>
      ))}
      {repositories.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No repository matches every search term. The full catalog search above may still find a
          local source.
        </p>
      )}
    </div>
  );
}
