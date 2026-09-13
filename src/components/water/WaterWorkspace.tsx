import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { area as turfArea, bbox, bboxPolygon } from "@turf/turf";
import { ArrowLeft, Droplets, PanelLeft, Play, Save, Download } from "lucide-react";
import { toast } from "sonner";
import { MapCanvas } from "@/components/gis/MapCanvas";
import { FeatureDestinationDialog } from "@/components/gis/FeatureDestinationDialog";
import { BasemapControl } from "@/components/gis/BasemapControl";
import { SearchBox } from "@/components/gis/SearchBox";
import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { importFile } from "@/lib/gis/import";
import { getCloudSession } from "@/lib/cloud";
import { analyzeWaterSource } from "@/lib/water/api";
import { measurementAge, validateWaterArea, waterCsv } from "@/lib/water/model";
import { WATER_OPTIONAL_SOURCES, WATER_SOURCES } from "@/lib/water/registry";
import {
  WATER_DISCLAIMER,
  type WaterAnalysis,
  type WaterArea,
  type WaterRecord,
  type WaterSourceResult,
} from "@/lib/water/types";

const PrintComposer = lazy(() =>
  import("@/components/gis/PrintComposer").then((m) => ({ default: m.PrintComposer })),
);

const button =
  "min-h-11 rounded-lg border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-40";
function download(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WaterWorkspace() {
  const wb = useWorkbench();
  const { map, printOpen, setPrintOpen } = useMapRef();
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState<"Overview" | "Records" | "Sources">("Overview");
  const [optional, setOptional] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<WaterSourceResult[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const run = useRef(0);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );
  const state = wb.waterWorkspace;
  const study = state?.area;
  const results = progress ?? state?.analysis?.results ?? [];
  const records = results.flatMap((r) => r.records);
  const filtered = records.filter((r) =>
    `${r.name} ${r.kind} ${r.aquifer ?? ""} ${r.county ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selectedMapFeature = wb.selectedFeature
    ? wb.layers.find((l) => l.id === wb.selectedFeature!.layerId)?.data.features[
        wb.selectedFeature.index
      ]
    : undefined;
  const record = records.find(
    (r) => r.id === (selectedMapFeature?.properties?.["waterRecordId"] ?? selected),
  );
  const polygons = useMemo(
    () =>
      wb.layers.flatMap((l) =>
        l.data.features.flatMap((f, i) =>
          f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
            ? [{ key: `${l.id}:${i}`, label: `${l.name} · ${i + 1}`, feature: f as WaterArea }]
            : [],
        ),
      ),
    [wb.layers],
  );

  function choose(a: WaterArea) {
    try {
      const valid = validateWaterArea(a);
      run.current++;
      setBusy(false);
      setProgress(null);
      setSelected(null);
      wb.setWaterWorkspace({ version: 1, enabled: true, area: valid });
      // Old study outputs cannot remain visible as results for the new area.
      for (const l of wb.layers.filter((l) => l.name.startsWith("Water evidence ·")))
        wb.updateLayer(l.id, { visible: false });
      const boundary = wb.layers.find((l) => l.name === "Water study boundary");
      const data = { type: "FeatureCollection" as const, features: [valid] };
      if (boundary) wb.updateLayer(boundary.id, { data, visible: true });
      else
        wb.addLayer({
          name: "Water study boundary",
          data,
          groupId:
            wb.groups.find((g) => g.name === "Water & Hydrogeology")?.id ??
            wb.addGroup("Water & Hydrogeology"),
          source: { kind: "draw" },
          style: {
            fillColor: "#0284c7",
            fillOpacity: 0.06,
            strokeColor: "#0284c7",
            strokeWidth: 2,
          },
        });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid study area");
    }
  }
  async function importBoundary(file: File) {
    try {
      if (file.size > 10_000_000) throw new Error("Use a boundary file smaller than 10 MB.");
      const imported = await importFile(file);
      const geometries = imported.data.features.flatMap((f) =>
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.type === "MultiPolygon"
            ? f.geometry.coordinates
            : [],
      );
      if (!geometries.length) throw new Error("File contains no polygon boundaries.");
      const valid = validateWaterArea({
        type: "Feature",
        properties: {},
        geometry: { type: "MultiPolygon", coordinates: geometries },
      });
      choose(valid);
      const b = bbox(valid);
      map?.fitBounds(
        [
          [b[0]!, b[1]!],
          [b[2]!, b[3]!],
        ],
        { padding: 50 },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import boundary");
    }
  }
  async function analyze() {
    if (!study || !wb.canEditProject) return;
    const token = ++run.current;
    setBusy(true);
    setProgress([]);
    setSelected(null);
    const collected: WaterSourceResult[] = [];
    const groupId =
      wb.groups.find((g) => g.name === "Water & Hydrogeology")?.id ??
      wb.addGroup("Water & Hydrogeology");
    for (const old of wb.layers.filter((l) => l.name.startsWith("Water evidence ·")))
      wb.updateLayer(old.id, { visible: false });
    for (const source of WATER_SOURCES.filter((s) => s.enabled)) {
      if (token !== run.current) return;
      let result: WaterSourceResult;
      try {
        const session = await getCloudSession();
        result = JSON.parse(
          await analyzeWaterSource({
            data: { sourceId: source.id, area: study, accessToken: session.access_token },
          }),
        ) as WaterSourceResult;
      } catch {
        result = {
          sourceId: source.id,
          status: "unavailable",
          records: [],
          retrievedAt: new Date().toISOString(),
          message: "Request failed. Retry this analysis or view the original source.",
          truncated: false,
          requestUrl: "",
          rejectedCount: 0,
        };
      }
      if (token !== run.current) return;
      collected.push(result);
      setProgress([...collected]);
      if (result.records.length) {
        const data = {
          type: "FeatureCollection" as const,
          features: result.records.map((r) => ({
            type: "Feature" as const,
            geometry: r.geometry,
            properties: {
              waterRecordId: r.id,
              NAME: r.name,
              source: source.agency,
              sourceRecordId: r.sourceRecordId,
              sourceUrl: r.sourceUrl,
              classification: r.classification,
              evidence: r.evidence,
              aquifer: r.aquifer,
              observationTime: r.observationTime,
              retrievedAt: r.retrievedAt,
            },
          })),
        };
        const name = `Water evidence · ${source.title}`;
        const existing = wb.layers.find((l) => l.name === name);
        if (existing) wb.updateLayer(existing.id, { data, visible: true });
        else
          wb.addLayer({
            name,
            groupId,
            data,
            source: { kind: "import", fileName: `${source.id}-public-records.geojson` },
            style: {
              fillColor:
                source.id === "twdb-aquifers"
                  ? "#b45309"
                  : source.id === "twdb-wells"
                    ? "#0d9488"
                    : "#0284c7",
              fillOpacity: source.id === "twdb-aquifers" ? 0.15 : 0.8,
              pointSize: 5,
            },
          });
      }
    }
    const analysis: WaterAnalysis = {
      id: crypto.randomUUID(),
      version: "water-evidence-1",
      area: study,
      createdAt: new Date().toISOString(),
      results: collected,
    };
    wb.setWaterWorkspace({ version: 1, enabled: true, area: study, analysis });
    setBusy(false);
  }
  function inspect(r: WaterRecord) {
    setSelected(r.id);
    wb.setSelectedFeature(null);
    if (r.geometry.type === "Point")
      map?.flyTo({
        center: r.geometry.coordinates as [number, number],
        zoom: Math.max(map.getZoom(), 12),
      });
  }
  function exportReport() {
    const analysis = state?.analysis;
    if (!analysis) return;
    const body = [
      `# LandDraft Water evidence report`,
      `Analysis ${analysis.id} · ${analysis.createdAt} · ${analysis.version}`,
      WATER_DISCLAIMER,
      `## Study area\n${(turfArea(analysis.area) / 4046.8564224).toFixed(1)} acres. Study boundary included in the JSON snapshot.`,
      "## Executive screening summary\nSource-record inventory only. Water availability, current quality, sustainable yield, aquifer thickness and drilling suitability are NOT established.",
      ...analysis.results.map(
        (r) =>
          `## ${WATER_SOURCES.find((s) => s.id === r.sourceId)?.title}\n${r.status}: ${r.message}\nRetrieved ${r.retrievedAt}. Rejected records: ${r.rejectedCount}.\nSource: ${r.requestUrl || WATER_SOURCES.find((s) => s.id === r.sourceId)?.url}`,
      ),
      "## Next investigations\nObtain original well logs and dated water-level/quality measurements; verify aquifer identity and vertical datum; consult applicable agencies and a qualified hydrogeologist before development.",
      "## Evidence\n" +
        analysis.results
          .flatMap((r) => r.records)
          .map(
            (r) =>
              `- ${r.name} (${r.sourceRecordId}): ${r.kind}; aquifer ${r.aquifer ?? "unknown"}; ${r.classification} / ${r.evidence}; measured ${r.observationTime ?? "date unknown"}; ${r.measurement ? `${r.measurement.originalValue} ${r.measurement.unit ?? "unknown unit"}; ${measurementAge(r.observationTime)}; ${r.measurement.approval ?? "approval unknown"}` : ""}; ${r.sourceUrl}`,
          )
          .join("\n"),
    ].join("\n\n");
    download("landdraft-water-report.md", body, "text/markdown");
  }
  return (
    <div className="app-viewport flex flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <a href="/" className={button} aria-label="Return to LandDraft map">
          <ArrowLeft className="size-4" />
        </a>
        <Droplets className="size-5 text-sky-600" />
        <div className="mr-auto">
          <h1 className="text-sm font-semibold">Water & Hydrogeology</h1>
          <p className="text-xs text-muted-foreground">
            {wb.projectName} · Optional research preview
          </p>
        </div>
        <button className={button} onClick={() => setPanel(!panel)} aria-expanded={panel}>
          <PanelLeft className="size-4" />
          <span className="sr-only">Water tools</span>
        </button>
        <button
          className={button}
          disabled={!wb.canEditProject}
          onClick={() => void wb.saveProject("manual")}
        >
          <Save className="inline size-4" /> Save
        </button>
      </header>
      <main className="relative min-h-0 flex-1">
        <MapCanvas />
        <FeatureDestinationDialog />
        {printOpen && (
          <Suspense fallback={null}>
            <PrintComposer />
          </Suspense>
        )}
        <div className="absolute right-12 top-3 z-10 max-w-[50%]">
          <SearchBox />
        </div>
        <div className="absolute bottom-8 right-3 z-10">
          <BasemapControl />
        </div>
        {panel && (
          <aside
            aria-label="Water tools"
            className="absolute inset-x-2 bottom-3 z-20 max-h-[52%] overflow-auto rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur md:inset-x-auto md:bottom-3 md:left-3 md:top-3 md:max-h-none md:w-[360px]"
          >
            {!state?.enabled ? (
              <>
                <h2 className="font-semibold">Draw an area. Investigate its water.</h2>
                <p className="my-3 text-sm text-muted-foreground">
                  Bring public wells, monitoring sites and source evidence into this project. This
                  preview does not establish drilling suitability or water rights.
                </p>
                <button
                  className={button}
                  disabled={!wb.canEditProject}
                  onClick={() => wb.setWaterWorkspace({ version: 1, enabled: true })}
                >
                  Enable Water for this project
                </button>
              </>
            ) : (
              <>
                <nav className="mb-4 flex gap-1" aria-label="Water sections">
                  {(["Overview", "Records", "Sources"] as const).map((t) => (
                    <button
                      key={t}
                      aria-pressed={tab === t}
                      className={`${button} ${tab === t ? "bg-secondary font-semibold" : ""}`}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </nav>
                {tab === "Overview" && (
                  <>
                    <h2 className="font-semibold">1. Study area</h2>
                    <div className="my-2 grid grid-cols-2 gap-2">
                      <button
                        className={button}
                        disabled={!map || !wb.canEditProject}
                        onClick={() => {
                          if (map) {
                            const b = map.getBounds();
                            choose(
                              bboxPolygon([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]),
                            );
                          }
                        }}
                      >
                        Use map extent
                      </button>
                      <button
                        className={button}
                        disabled={!wb.canEditProject}
                        onClick={() => {
                          wb.setDrawMode("polygon");
                          setPanel(false);
                        }}
                      >
                        Draw polygon
                      </button>
                    </div>
                    <input
                      ref={upload}
                      type="file"
                      className="hidden"
                      accept=".geojson,.json,.kml,.kmz,.zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void importBoundary(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      className={`${button} mb-2 w-full`}
                      disabled={!wb.canEditProject}
                      onClick={() => upload.current?.click()}
                    >
                      Import GeoJSON, KML/KMZ or zipped SHP
                    </button>
                    <label className="block text-xs">
                      Use a project/imported boundary
                      <select
                        className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2 text-sm"
                        value=""
                        disabled={!wb.canEditProject}
                        onChange={(e) => {
                          const p = polygons.find((p) => p.key === e.target.value);
                          if (p) choose(p.feature);
                        }}
                      >
                        <option value="">Select polygon…</option>
                        {polygons.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {study && (
                      <p className="my-2 text-sm">
                        {(turfArea(study) / 4046.8564224).toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })}{" "}
                        acres · {(turfArea(study) / 2589988.11).toFixed(2)} sq mi
                      </p>
                    )}
                    <button
                      className={`${button} my-3 w-full bg-primary text-primary-foreground`}
                      disabled={!study || busy || !wb.canEditProject}
                      onClick={() => void analyze()}
                    >
                      <Play className="mr-2 inline size-4" />
                      {busy
                        ? `Analyzing · ${results.length}/${WATER_SOURCES.length} sources`
                        : "Analyze Water"}
                    </button>
                    <div role="status" aria-live="polite" className="space-y-2">
                      {results.map((r) => (
                        <div key={r.sourceId} className="rounded-lg border p-3 text-xs">
                          <strong>
                            {WATER_SOURCES.find((s) => s.id === r.sourceId)?.title} · {r.status}
                          </strong>
                          <p className="mt-1">{r.message}</p>
                          <p className="mt-1 text-muted-foreground">
                            Retrieved {new Date(r.retrievedAt).toLocaleString()}; inspect each
                            record for measurement date and age.
                          </p>
                        </div>
                      ))}
                    </div>
                    {results.length > 0 && (
                      <div className="my-3 rounded-lg bg-secondary p-3 text-sm">
                        <strong>Evidence completeness: limited</strong>
                        <p>
                          {records.length} source records. Sensor readings may be historical.
                          Complete chemistry, tested yield, rights and aquifer geometry have not
                          been established.
                        </p>
                        <p className="mt-2 text-xs">
                          Counties in retrieved records:{" "}
                          {[...new Set(records.map((r) => r.county).filter(Boolean))].join(", ") ||
                            "Unknown"}
                          . This is not a boundary intersection survey.
                        </p>
                      </div>
                    )}
                    <button className={button} onClick={() => setPrintOpen(true)}>
                      Compose map / PDF figure
                    </button>
                    {state.analysis && !busy && (
                      <div className="flex flex-wrap gap-2">
                        <button className={button} onClick={exportReport}>
                          <Download className="inline size-4" /> Report (.md)
                        </button>
                        <button
                          className={button}
                          onClick={() =>
                            download(
                              "water-evidence.json",
                              JSON.stringify(state.analysis, null, 2),
                              "application/json",
                            )
                          }
                        >
                          Evidence snapshot
                        </button>
                        <button
                          className={button}
                          onClick={() =>
                            download("water-records.csv", waterCsv(records), "text/csv")
                          }
                        >
                          CSV
                        </button>
                      </div>
                    )}
                  </>
                )}
                {tab === "Records" && (
                  <>
                    <label className="text-xs">
                      Find wells, aquifers or counties
                      <input
                        className="my-2 min-h-11 w-full rounded-lg border bg-background p-2"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search source records"
                      />
                    </label>
                    <p className="mb-2 text-xs">
                      {filtered.length} records · ○ blue USGS · ○ teal TWDB
                    </p>
                    {record && <RecordCard record={record} />}
                    <div className="space-y-1">
                      {filtered.slice(0, 200).map((r) => (
                        <button
                          key={r.id}
                          className="min-h-11 w-full rounded-lg border p-2 text-left text-xs hover:bg-secondary"
                          onClick={() => inspect(r)}
                        >
                          <strong>{r.name}</strong>
                          <span className="block text-muted-foreground">
                            {r.kind} · {r.aquifer ?? "Aquifer unknown"} · {r.sourceId}
                          </span>
                        </button>
                      ))}
                    </div>
                    {filtered.length > 200 && (
                      <p className="text-xs">
                        Showing 200 rows. Narrow the search or export all retrieved records.
                      </p>
                    )}
                    {!records.length && (
                      <p className="text-sm">
                        Analyze an area to retrieve records. No data does not mean no water.
                      </p>
                    )}
                  </>
                )}
                {tab === "Sources" && (
                  <>
                    <h2 className="font-semibold">Water Sources</h2>
                    {WATER_SOURCES.map((s) => (
                      <div key={s.id} className="my-3 rounded-lg border p-3 text-xs">
                        <strong>{s.title}</strong>
                        <p>
                          {s.coverage} · {s.license.replaceAll("_", " ")}
                        </p>
                        <p>
                          Credit: {s.attribution} · reviewed {s.reviewedAt}
                        </p>
                        <div className="mt-2 flex gap-4">
                          <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                            Original source
                          </a>
                          <a href={s.terms} target="_blank" rel="noreferrer" className="underline">
                            Terms
                          </a>
                        </div>
                      </div>
                    ))}
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={optional}
                        onChange={(e) => setOptional(e.target.checked)}
                      />
                      Show all possible layers
                    </label>
                    {optional &&
                      WATER_OPTIONAL_SOURCES.map((s) => (
                        <div
                          key={s.title}
                          className="my-2 rounded-lg border p-3 text-xs text-muted-foreground"
                        >
                          <strong>{s.title} · Unavailable</strong>
                          <p>{s.requirement}</p>
                          <a href={s.url} className="underline" target="_blank" rel="noreferrer">
                            Investigate original source
                          </a>
                        </div>
                      ))}
                  </>
                )}
                {wb.layers.some(
                  (l) => l.name.startsWith("Water evidence ·") && l.data.features.length,
                ) && (
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm">
                      Map layers & legends
                    </summary>
                    {wb.layers
                      .filter(
                        (l) => l.name.startsWith("Water evidence ·") && l.data.features.length,
                      )
                      .map((l) => (
                        <div key={l.id} className="mb-2 rounded-lg border p-2 text-xs">
                          <label className="flex min-h-11 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={l.visible}
                              onChange={() => wb.toggleVisible(l.id)}
                            />
                            <span>
                              {l.name} ·{" "}
                              {l.data.features[0]?.properties?.["classification"] as string}
                            </span>
                          </label>
                          <label>
                            Opacity
                            <input
                              aria-label={`${l.name} opacity`}
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={l.style.fillOpacity}
                              onChange={(e) =>
                                wb.updateStyle(l.id, { fillOpacity: Number(e.target.value) })
                              }
                              className="min-h-11 w-full"
                            />
                          </label>
                        </div>
                      ))}
                  </details>
                )}
                <details className="mt-4 text-xs text-muted-foreground">
                  <summary className="min-h-11 cursor-pointer py-2">
                    Scope, limitations & module settings
                  </summary>
                  <p>{WATER_DISCLAIMER}</p>
                  <p className="my-2">
                    Project enablement is a preference, not a subscription grant. Advanced analytics
                    and Deep Research are not active in this preview.
                  </p>
                  <button
                    disabled={!wb.canEditProject}
                    className={button}
                    onClick={() => {
                      run.current++;
                      setBusy(false);
                      wb.setWaterWorkspace({ ...state, enabled: false });
                      for (const l of wb.layers.filter((l) =>
                        l.name.startsWith("Water evidence ·"),
                      ))
                        wb.updateLayer(l.id, { visible: false });
                    }}
                  >
                    Disable Water
                  </button>
                </details>
              </>
            )}
          </aside>
        )}
        {!panel && (
          <button
            className={`${button} absolute bottom-5 left-3 z-20 bg-background shadow-lg`}
            onClick={() => setPanel(true)}
          >
            Water tools
          </button>
        )}
      </main>
    </div>
  );
}

function RecordCard({ record: r }: { record: WaterRecord }) {
  return (
    <section
      aria-label="Selected water record"
      className="mb-3 rounded-xl border-2 border-sky-600 p-3 text-xs"
    >
      <h3 className="font-semibold">{r.name}</h3>
      <p className="my-2">
        {r.classification} · {r.evidence}
      </p>
      {r.measurement && (
        <div className="my-2 rounded-lg bg-secondary p-2">
          <strong>
            {r.measurement.originalValue || "No numeric value"}{" "}
            {r.measurement.unit ?? "Unit unknown"}
          </strong>
          <p>
            USGS parameter {r.measurement.parameterCode} ·{" "}
            {r.measurement.approval ?? "Approval unknown"}
          </p>
          <p>
            {measurementAge(r.observationTime)} ·{" "}
            {r.observationTime
              ? `${Math.max(0, Math.floor((Date.now() - Date.parse(r.observationTime)) / 3_600_000))} hours old`
              : "Age unknown"}
          </p>
          <a
            href={`https://api.waterdata.usgs.gov/ogcapi/v1/collections/parameter-codes/items/${encodeURIComponent(r.measurement.parameterCode)}?f=html`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Parameter definition and units
          </a>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2">
        <dt>Aquifer (source term)</dt>
        <dd>{r.aquifer ?? "Unknown"}</dd>
        <dt>Well depth</dt>
        <dd>
          {r.depth === null
            ? "Unknown / unverified units"
            : `${r.depth} ${r.depthUnit} below land surface`}
        </dd>
        <dt>Vertical datum</dt>
        <dd>{r.verticalDatum ?? "Unknown"}</dd>
        <dt>Location accuracy</dt>
        <dd>{r.locationAccuracy ?? "Unknown"}</dd>
        <dt>HUC</dt>
        <dd>{r.huc ?? "Unknown"}</dd>
        <dt>Measured date</dt>
        <dd>{r.observationTime ? new Date(r.observationTime).toLocaleString() : "Unknown"}</dd>
        <dt>Retrieved</dt>
        <dd>{new Date(r.retrievedAt).toLocaleString()}</dd>
      </dl>
      <ul className="my-2 list-disc pl-4">
        {r.flags.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <a
        href={r.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-block min-h-11 py-2 underline"
      >
        View original source · {r.sourceRecordId}
      </a>
      <details>
        <summary className="min-h-11 cursor-pointer py-2">How obtained / original fields</summary>
        <p>Direct source record; no interpolation, flow or yield model applied.</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">
          {JSON.stringify(r.raw, null, 2)}
        </pre>
      </details>
    </section>
  );
}
