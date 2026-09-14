import {
  NATIVE_RADAR_PRODUCTS,
  nativeFrameAt,
  type NativeRadarReading,
} from "@/lib/weather/nativeRadar";
import type { WeatherBundle, WeatherWorkspaceState } from "@/lib/weather/types";
import { useMapRef } from "@/lib/gis/mapRef";
import { radarSiteDistanceKm } from "@/lib/weather/radar";

const MAX_SITES = 6;

export function NativeRadarControls({
  workspace,
  bundle,
  readings,
  onWorkspace,
  onLayer,
  showProducts = true,
}: {
  workspace: WeatherWorkspaceState;
  bundle: WeatherBundle | null;
  readings: Record<string, NativeRadarReading>;
  onWorkspace(value: WeatherWorkspaceState): void;
  onLayer(id: string, change: { visible: boolean }): void;
  showProducts?: boolean;
}) {
  const { map } = useMapRef();
  const mode = workspace.radarSiteMode ?? (workspace.radarSiteId ? "manual" : "automatic");
  const selectedIds = workspace.radarSiteIds?.length
    ? workspace.radarSiteIds
    : workspace.radarSiteId
      ? [workspace.radarSiteId]
      : [];
  const loadedSites = Array.from(
    new Map((bundle?.nativeRadarFrames ?? []).map((frame) => [frame.site.id, frame.site])).values(),
  );
  const focus = bundle?.request.radarFocus ?? bundle?.request.mapCenter;
  const availableSites = [...(bundle?.radarSites ?? [])].sort((a, b) =>
    focus
      ? radarSiteDistanceKm(a, { longitude: focus[0], latitude: focus[1] }) -
        radarSiteDistanceKm(b, { longitude: focus[0], latitude: focus[1] })
      : a.id.localeCompare(b.id),
  );
  const updateMode = (radarSiteMode: "automatic" | "covering" | "manual") =>
    (() => {
      const radarSiteIds =
        radarSiteMode === "manual"
          ? selectedIds.length
            ? selectedIds
            : loadedSites[0]
              ? [loadedSites[0].id]
              : availableSites[0]
                ? [availableSites[0].id]
                : []
          : [];
      onWorkspace({
        ...workspace,
        radarSiteMode,
        radarSiteIds,
        radarSiteId: radarSiteMode === "manual" ? radarSiteIds[0] : undefined,
      });
    })();
  return (
    <details className="rounded-2xl border border-border bg-background" open>
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
        LandDraft native radar
      </summary>
      <div className="space-y-3 border-t border-border p-3 text-xs">
        <p className="text-[10px] text-muted-foreground">
          Public NOAA scans · LandDraft colors and inspection · no weather subscription
        </p>
        <label className="block space-y-1">
          <span>Radar coverage</span>
          <select
            aria-label="Radar coverage mode"
            className="w-full rounded-lg border bg-background p-2"
            value={mode}
            onChange={(e) => updateMode(e.target.value as "automatic" | "covering" | "manual")}
          >
            <option value="automatic">Closest site · follows active focus</option>
            <option value="covering">All covering sites · composite</option>
            <option value="manual">Choose multiple sites</option>
          </select>
        </label>
        <p className="text-[10px] text-muted-foreground">
          Focus: {bundle?.request.radarFocusSource ?? "map"}. Automatic priority is selected storm,
          target, GPS, inspection point, then map center. All covering sites uses up to {MAX_SITES}
          nearby NOAA radars.
        </p>
        {mode === "manual" && (
          <label className="block space-y-1">
            <span>
              Add radar site ({selectedIds.length}/{MAX_SITES})
            </span>
            <select
              aria-label="Add radar site"
              className="w-full rounded-lg border bg-background p-2"
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (!id || selectedIds.includes(id) || selectedIds.length >= MAX_SITES) return;
                const radarSiteIds = [...selectedIds, id];
                onWorkspace({
                  ...workspace,
                  radarSiteMode: "manual",
                  radarSiteIds,
                  radarSiteId: radarSiteIds[0],
                });
              }}
            >
              <option value="">Select a NOAA radar…</option>
              {availableSites
                .filter((site) => !selectedIds.includes(site.id))
                .map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.id} · {site.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {!!loadedSites.length && (
          <div className="flex flex-wrap gap-1">
            {loadedSites.map((site) => (
              <span
                key={site.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1"
              >
                <button
                  onClick={() => map?.flyTo({ center: [site.longitude, site.latitude], zoom: 8 })}
                  title={`Center map on ${site.name}`}
                >
                  {site.id}
                </button>
                {mode === "manual" && (
                  <button
                    aria-label={`Remove radar ${site.id}`}
                    onClick={() => {
                      const radarSiteIds = selectedIds.filter((id) => id !== site.id);
                      onWorkspace({ ...workspace, radarSiteIds, radarSiteId: radarSiteIds[0] });
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <label className="block space-y-1">
          <span>Elevation product</span>
          <select
            aria-label="Radar elevation"
            className="w-full rounded-lg border bg-background p-2"
            value={workspace.radarTilt ?? 0}
            onChange={(e) => onWorkspace({ ...workspace, radarTilt: Number(e.target.value) })}
          >
            {[0, 1, 2, 3].map((tilt) => (
              <option key={tilt} value={tilt}>
                {tilt === 0 ? "Lowest elevation" : `Elevation product ${tilt + 1}`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[10px] text-muted-foreground">
          Actual beam angle is read from the scan. Tap the map to inspect a radar gate. Last six
          available scans, up to one hour.
        </p>
        <div className="space-y-1">
          {Object.entries(NATIVE_RADAR_PRODUCTS).map(([id, spec]) => {
            const visible = !!workspace.layerSettings[id]?.visible;
            if (!showProducts && !visible) return null;
            const frame = nativeFrameAt(
              (bundle?.nativeRadarFrames ?? []).filter((f) => f.layerId === id),
              workspace.timeline.selectedTime,
            );
            const layerReadings = Object.values(readings).filter((item) => item.layerId === id);
            const reading =
              layerReadings.find((item) => item.state === "ready") ?? layerReadings[0];
            const readingFrame = (bundle?.nativeRadarFrames ?? []).find(
              (candidate) => candidate.layerId === id && candidate.site.id === reading?.site,
            );
            const matches =
              readingFrame &&
              reading?.timestamp &&
              Math.abs(Date.parse(readingFrame.timestamp) - Date.parse(reading.timestamp)) < 60000;
            const value =
              reading?.category ??
              (reading?.value === null || reading?.value === undefined
                ? (reading?.sampleState ?? "Unavailable")
                : `${reading.value.toFixed(id.endsWith("correlation") ? 3 : 1)} ${reading.units}`);
            return (
              <div key={id} className="rounded-lg bg-secondary p-2">
                <label className="flex items-center gap-2">
                  {showProducts && (
                    <input
                      type="checkbox"
                      aria-label={`Native ${spec.name}`}
                      checked={visible}
                      onChange={(e) => onLayer(id, { visible: e.target.checked })}
                    />
                  )}
                  {spec.name}
                </label>
                {visible && (
                  <div className="mt-2 space-y-1 text-[10px]">
                    <strong>
                      {workspace.timeline.mode === "forecast"
                        ? "Hidden in forecast mode"
                        : !frame
                          ? "No scan available at this time"
                          : reading?.state === "error"
                            ? reading.message
                            : matches
                              ? value
                              : "Loading scan…"}
                    </strong>
                    {matches && workspace.timeline.mode !== "forecast" && (
                      <>
                        <p>
                          {reading.site} · {reading.elevationDeg}° ·{" "}
                          {new Date(reading.timestamp!).toLocaleTimeString()}
                        </p>
                        <p>
                          Range {reading.rangeKm?.toFixed(1)} km · beam center{" "}
                          {reading.beamHeightM?.toFixed(0)} m MSL (estimated)
                        </p>
                      </>
                    )}
                    {loadedSites.length > 1 && (
                      <p>
                        {loadedSites.length} radar sites composited:{" "}
                        {loadedSites.map((site) => site.id).join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Velocity is toward/away from the radar, not surface wind. Missing gates are transparent;
          range folding is hatched. Low correlation alone does not confirm debris.
        </p>
      </div>
    </details>
  );
}
