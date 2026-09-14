import { useEffect, useState } from "react";
import { cloudDataRequest } from "@/lib/cloud";
import { useWorkbench } from "@/lib/gis/store";
import type { FeatureCollection } from "geojson";

interface CacheStatus {
  status: string;
  weekly: boolean;
  retrieved_at: string | null;
  next_check_at: string;
  last_checked_at: string | null;
  error: string | null;
  feature_count: number | null;
  bounds: number[];
}

export function ParcelCacheControls() {
  const wb = useWorkbench();
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const base = `/rest/v1/project_parcel_cache?project_id=eq.${encodeURIComponent(wb.projectId)}`;
  const refresh = async () => {
    try {
      const [policy, rows] = await Promise.all([
        cloudDataRequest<
          Array<{
            enabled: boolean;
            terms_reviewed_at: string | null;
            scheduler_last_seen: string | null;
          }>
        >("/rest/v1/parcel_cache_policy?select=enabled,terms_reviewed_at,scheduler_last_seen"),
        cloudDataRequest<CacheStatus[]>(
          `${base}&select=status,weekly,retrieved_at,next_check_at,last_checked_at,error,feature_count,bounds`,
        ),
      ]);
      const p = policy[0];
      setAvailable(
        Boolean(
          p?.enabled &&
          p.terms_reviewed_at &&
          p.scheduler_last_seen &&
          Date.now() - Date.parse(p.scheduler_last_seen) < 7200000,
        ),
      );
      setStatus(rows[0] ?? null);
    } catch {
      setAvailable(false);
      setError("Saved parcel downloads are not configured on this site yet.");
    }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
    // Refresh only the currently selected project; user changes do not reconfigure subscriptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wb.projectId]);
  const configure = async (pause = false) => {
    setBusy(true);
    setError("");
    try {
      await cloudDataRequest("/rest/v1/rpc/configure_parcel_cache", {
        method: "POST",
        body: JSON.stringify({
          p_project: wb.projectId,
          p_bounds: wb.projectArea?.bounds ?? null,
          p_weekly: weekly,
          p_pause: pause,
        }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parcel download could not be queued.");
    } finally {
      setBusy(false);
    }
  };
  const loadCopy = async () => {
    setBusy(true);
    try {
      const [row] = await cloudDataRequest<
        Array<{
          data: FeatureCollection;
          retrieved_at: string;
          provenance: Record<string, unknown>;
        }>
      >(`${base}&select=data,retrieved_at,provenance`);
      if (!row?.data || row.data.type !== "FeatureCollection")
        throw new Error("No completed saved copy is available.");
      const source = {
        kind: "derived" as const,
        sourceLayerId: wb.projectId,
        query: "parcel-cache:v1",
        cachedAt: row.retrieved_at,
        cacheProvenance: row.provenance,
      };
      const existing = wb.layers.find(
        (l) => l.source.kind === "derived" && l.source.query === "parcel-cache:v1",
      );
      if (existing) wb.updateLayer(existing.id, { data: row.data, source });
      else
        wb.addLayer({
          name: "Texas parcels — saved project area",
          data: row.data,
          source,
          groupId: wb.derivedLayerGroupId,
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saved copy could not be loaded.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="Saved project-area parcels"
      className="space-y-2 border-t border-border pt-2"
    >
      <h4 className="font-semibold text-foreground">Save project-area parcels</h4>
      <p>
        Download a complete copy for the fixed project area. Keep the last successful copy if
        updates fail. Up to 5,000 parcels per area; boundaries are not surveys.
      </p>
      {!wb.projectArea?.bounds && (
        <p>
          Use Set project area to save a fixed boundary first. Older camera-only areas need to be
          saved again.
        </p>
      )}
      {wb.projectArea?.bounds && (
        <p>Area (W, S, E, N): {wb.projectArea.bounds.map((v) => v.toFixed(4)).join(", ")}</p>
      )}
      {!available && (
        <p>
          Unavailable until the parcel source, download terms, and background scheduler are
          verified.
        </p>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
        Check for updates every week, even when LandDraft is closed
      </label>
      <p>Publisher records may be annual or older. Weekly checks do not imply new weekly data.</p>
      {wb.accessRole === "owner" && (
        <button
          disabled={busy || !available || !wb.projectArea?.bounds}
          onClick={() => void configure()}
          className="rounded border border-border px-2 py-2 disabled:opacity-50"
        >
          Download & store project area
        </button>
      )}
      {status && (
        <div className="space-y-1">
          <p>
            Status: {status.status} · Weekly updates {status.weekly ? "on" : "off"}
          </p>
          <p>
            Last checked:{" "}
            {status.last_checked_at ? new Date(status.last_checked_at).toLocaleString() : "Not yet"}
          </p>
          <p>
            Saved copy:{" "}
            {status.retrieved_at ? new Date(status.retrieved_at).toLocaleString() : "None"} ·{" "}
            {status.feature_count ?? "—"} parcels
          </p>
          {status.weekly && <p>Next check: {new Date(status.next_check_at).toLocaleString()}</p>}
          {status.error && (
            <p role="status" className="text-destructive">
              {status.error}
            </p>
          )}
          {status.retrieved_at && wb.canEditProject && (
            <button
              disabled={busy}
              onClick={() => void loadCopy()}
              className="rounded border border-border px-2 py-2"
            >
              Use saved copy on map
            </button>
          )}
          {wb.accessRole === "owner" && (
            <button
              disabled={busy}
              onClick={() => void configure(true)}
              className="rounded border border-border px-2 py-2"
            >
              Pause downloads
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="status" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
