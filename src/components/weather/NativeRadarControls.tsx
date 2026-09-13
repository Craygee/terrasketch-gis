import {
  NATIVE_RADAR_PRODUCTS,
  nativeFrameAt,
  type NativeRadarReading,
} from "@/lib/weather/nativeRadar";
import type { WeatherBundle, WeatherWorkspaceState } from "@/lib/weather/types";

export function NativeRadarControls({
  workspace,
  bundle,
  readings,
  onWorkspace,
  onLayer,
}: {
  workspace: WeatherWorkspaceState;
  bundle: WeatherBundle | null;
  readings: Record<string, NativeRadarReading>;
  onWorkspace(value: WeatherWorkspaceState): void;
  onLayer(id: string, change: { visible: boolean }): void;
}) {
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
          <span>Radar site</span>
          <select
            aria-label="Radar site"
            className="w-full rounded-lg border bg-background p-2"
            value={workspace.radarSiteId ?? ""}
            onChange={(e) => onWorkspace({ ...workspace, radarSiteId: e.target.value })}
          >
            <option value="">Nearest site to inspected point</option>
            {(bundle?.radarSites ?? []).map((site) => (
              <option key={site.id} value={site.id}>
                {site.id} · {site.name}
              </option>
            ))}
          </select>
        </label>
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
            const frame = nativeFrameAt(
              (bundle?.nativeRadarFrames ?? []).filter((f) => f.layerId === id),
              workspace.timeline.selectedTime,
            );
            const reading = readings[id];
            const matches =
              frame &&
              reading?.timestamp &&
              Math.abs(Date.parse(frame.timestamp) - Date.parse(reading.timestamp)) < 60000;
            const value =
              reading?.category ??
              (reading?.value === null || reading?.value === undefined
                ? (reading?.sampleState ?? "Unavailable")
                : `${reading.value.toFixed(id.endsWith("correlation") ? 3 : 1)} ${reading.units}`);
            return (
              <div key={id} className="rounded-lg bg-secondary p-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Native ${spec.name}`}
                    checked={visible}
                    onChange={(e) => onLayer(id, { visible: e.target.checked })}
                  />
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
