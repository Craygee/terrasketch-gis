import { useEffect, useState } from "react";
import { getParcelManifest, type ParcelManifest } from "@/lib/gis/texasParcels";

/** Statewide public storage replaces the earlier project-area-only cache prototype. */
export function ParcelCacheControls() {
  const [manifest, setManifest] = useState<ParcelManifest | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    getParcelManifest(controller.signal)
      .then(setManifest)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Parcel status unavailable");
      });
    return () => controller.abort();
  }, []);
  return (
    <section
      className="space-y-2 rounded-md border border-border p-3 text-xs"
      aria-label="Texas statewide parcel storage"
    >
      <p className="font-semibold">Texas statewide parcel storage</p>
      {manifest && (
        <>
          <p>
            {manifest.features.toLocaleString()} mapped records · {manifest.countyCount} counties
          </p>
          <p>
            Source edition: {manifest.sourceDate}. Downloaded:{" "}
            {new Date(manifest.retrievedAt).toLocaleDateString()}.
          </p>
          {manifest.missingCountyFips.includes("48129") && (
            <p>Coverage gap: Donley County is absent from this release.</p>
          )}
          {manifest.unmappedFeatures > 0 && (
            <p>
              {manifest.unmappedFeatures.toLocaleString()} additional records have no usable source
              geometry and are retained separately.
            </p>
          )}
          <a className="block underline" href={manifest.sourceUrl} target="_blank" rel="noreferrer">
            Download original statewide archive (approximately 2.8 GB)
          </a>
        </>
      )}
      <p>
        The full available dataset is stored centrally. Zoom in to display parcels; only the visible
        area is requested.
      </p>
      {manifest?.weeklyUpdates && (
        <p>
          Automatic source checks: every Monday. A new edition replaces this copy only after
          validation.
        </p>
      )}
      <p>
        CC0-1.0 · TxGIO / contributing appraisal districts. County dates vary; boundaries are not
        surveys.
      </p>
      <a
        className="block underline"
        href="https://gio.texas.gov/stratmap/land-parcels.html"
        target="_blank"
        rel="noreferrer"
      >
        Original source and coverage information
      </a>
      {error && (
        <p role="status" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
