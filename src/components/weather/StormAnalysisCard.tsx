import { useEffect, useMemo, useState } from "react";
import { analyzeStormObject } from "@/lib/weather/stormAnalysis";
import { STORM_ANALYSIS_CONFIG } from "@/lib/weather/analysisConfig";
import type { StormObject } from "@/lib/weather/types";

export function StormAnalysisCard({
  storm,
  officialWarning,
}: {
  storm: StormObject;
  officialWarning: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const [period, setPeriod] = useState<number>(30);
  const [mode, setMode] = useState("Intensity");
  const [notifications, setNotifications] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const analysis = useMemo(() => analyzeStormObject(storm, now), [storm, now]);
  const latest = storm.history.at(-1);
  const history = analysis.history.filter(
    (sample) =>
      Date.parse(sample.time) >=
      Date.parse(latest?.validTime ?? storm.observedAt) - period * 60_000,
  );
  const dominant = Object.entries(analysis.intensity.hazards)
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .sort((a, b) => b[1] - a[1])[0];
  return (
    <section
      className="min-w-0 space-y-3 rounded-2xl border border-primary/30 bg-background p-3 text-xs"
      aria-label="LandDraft storm analysis"
    >
      <p className="font-bold text-primary">LANDDRAFT-DERIVED · EXPERIMENTAL</p>
      <p
        className={
          officialWarning
            ? "rounded-lg bg-red-100 p-2 font-bold text-red-900"
            : "text-muted-foreground"
        }
      >
        {officialWarning
          ? "OFFICIAL WARNING — takes priority over LandDraft analysis"
          : "Official warning state: check active NWS warning layers; absence of a linked warning is not an all-clear."}
      </p>
      <p className="text-base font-bold">
        Intensity:{" "}
        {analysis.intensity.value === null
          ? "INSUFFICIENT CURRENT DATA"
          : `${analysis.intensity.value} / 100 — ${analysis.intensity.classification}`}
      </p>
      {analysis.intensity.value === null && analysis.lastReliable && (
        <p>
          Last reliable context: {analysis.lastReliable.intensity.value}/100 —{" "}
          {analysis.lastReliable.intensity.classification},{" "}
          {new Date(analysis.lastReliable.time).toLocaleString()}. This is not a current score.
        </p>
      )}
      <p>
        <strong>Trend:</strong> {analysis.trend.state}
        {analysis.trend.change !== null &&
          ` · ${analysis.trend.change > 0 ? "+" : ""}${analysis.trend.change} over ${analysis.trend.durationMinutes?.toFixed(0)}m (${analysis.trend.ratePerMinute?.toFixed(1)}/min)`}
      </p>
      {analysis.trend.previous !== null && (
        <p className="text-muted-foreground">
          Smoothed comparison: {analysis.trend.previous} → {analysis.trend.current}/100. Current
          unsmoothed observation shown above.
        </p>
      )}
      <p>
        Confidence: <strong>{analysis.confidence}</strong> · Data quality:{" "}
        <strong>{analysis.quality}</strong>
      </p>
      <p>
        Primary analyzed hazard:{" "}
        {dominant ? `${dominant[0]} ${Math.round(dominant[1])}/100` : "INSUFFICIENT DATA"}
      </p>
      <div
        className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-2"
        aria-label="NOAA hazard probabilities"
      >
        <strong className="col-span-2">NOAA/NSSL probabilities · next hour</strong>
        {[
          ["ProbSevere", latest?.probabilitySeverePct],
          ["ProbTor", storm.hazards.tornado.probabilityPct],
          ["ProbHail", storm.hazards.hail.probabilityPct],
          ["ProbWind", storm.hazards.wind.probabilityPct],
        ].map(([name, value]) => (
          <span key={name}>
            {name}: {value === undefined || value === null ? "Unavailable" : `${value}%`}
          </span>
        ))}
        <span className="col-span-2">
          Probability is likelihood, not intensity. Source:{" "}
          {analysis.sources.find((source) => source.source === "probability")?.quality}.
        </span>
      </div>
      <details>
        <summary className="cursor-pointer py-2 font-semibold">Hazard intensities</summary>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(analysis.intensity.hazards).map(([name, value]) => (
            <p key={name}>
              {name === "rainFlood" ? "Heavy rain / flood" : name}:{" "}
              {value === null ? "INSUFFICIENT DATA" : `${Math.round(value)}/100`}
            </p>
          ))}
        </div>
        <p className="mt-2">
          Radar hail/rotation and lightning predictor indices are experimental signal strengths, not
          measured damage or confirmed tornadoes.
        </p>
      </details>
      <details>
        <summary className="cursor-pointer py-2 font-semibold">
          Why this rating? · sources & limitations
        </summary>
        {analysis.drivers.map((driver) => (
          <p className="mb-1" key={driver}>
            {driver}
          </p>
        ))}
        {analysis.limitations.map((reason) => (
          <p className="mb-1 text-muted-foreground" key={reason}>
            {reason}
          </p>
        ))}
        {analysis.sources.map((source) => (
          <details key={source.source} className="my-2 rounded border p-2">
            <summary>
              {source.source}: {source.quality} ·{" "}
              {source.ageSeconds === null
                ? "time unavailable"
                : `${Math.floor(source.ageSeconds / 60)}m old`}
            </summary>
            <p>
              Expected update: {source.expectedIntervalSeconds}s. Product timestamps proxy sensor
              times in this feed.
            </p>
            {source.inputs.map((input, index) => (
              <p className="mt-2 break-words" key={index}>
                {input.provider} · {input.product} · {input.value ?? "NULL"} {input.unit} ·{" "}
                {input.kind}
                <br />
                {input.observationTimeIsProductProxy
                  ? "Observation time estimate (product proxy)"
                  : "Observation"}
                : {input.observationTime ?? "unknown"}
                <br />
                Product: {input.productTime}
                <br />
                Retrieved: {input.retrievedAt}
                <br />
                Provider quality: {input.providerQuality ?? "not supplied"}
                <br />
                {input.method}
              </p>
            ))}
          </details>
        ))}
        <p>
          Calculation {analysis.version}; weighted physical components normalized over available
          inputs; probabilities have zero intensity weight. No safety inference.
        </p>
      </details>
      <details>
        <summary className="cursor-pointer py-2 font-semibold">
          History · intensity and probability in separate modes
        </summary>
        <div className="flex flex-wrap gap-2">
          {STORM_ANALYSIS_CONFIG.historyMinutes.map((minutes) => (
            <button
              type="button"
              className="min-h-10 rounded border px-3"
              aria-pressed={period === minutes}
              key={minutes}
              onClick={() => setPeriod(minutes)}
            >
              {minutes === 120 ? "2h" : `${minutes}m`}
            </button>
          ))}
        </div>
        <label className="my-2 block">
          History metric{" "}
          <select
            className="ml-2 max-w-full rounded border p-2"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            {["Intensity", "ProbSevere", "ProbTor", "ProbHail", "ProbWind"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <p>
          {mode === "Intensity" ? "Experimental intensity (0–100)" : "NOAA probability (%)"} ·
          available samples only; gaps are not interpolated.
        </p>
        <div className="max-h-64 overflow-auto">
          {mode === "Intensity" && (
            <svg
              viewBox="0 0 320 120"
              role="img"
              aria-label="Experimental intensity history, 0 to 100; missing samples omitted"
              className="my-2 w-full"
            >
              <text x="0" y="10" fontSize="9" fill="currentColor">
                100
              </text>
              <text x="8" y="108" fontSize="9" fill="currentColor">
                0
              </text>
              <line x1="28" x2="316" y1="105" y2="105" stroke="currentColor" />
              {history.map((sample) => {
                const end = Date.parse(latest?.validTime ?? storm.observedAt);
                const x = 30 + (1 - (end - Date.parse(sample.time)) / (period * 60000)) * 280;
                return sample.value === null ? null : (
                  <circle
                    key={sample.time}
                    cx={x}
                    cy={105 - sample.value * 0.95}
                    r="3"
                    fill="currentColor"
                  >
                    <title>
                      {new Date(sample.time).toLocaleTimeString()}: {sample.value}/100
                    </title>
                  </circle>
                );
              })}
              <text x="28" y="118" fontSize="9" fill="currentColor">
                −{period}m
              </text>
              <text x="285" y="118" fontSize="9" fill="currentColor">
                latest
              </text>
            </svg>
          )}
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Observation</th>
                <th>{mode === "Intensity" ? "Index" : "%"}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((sample) => {
                const original = storm.history.find((item) => item.validTime === sample.time);
                const value =
                  mode === "Intensity"
                    ? sample.value
                    : mode === "ProbSevere"
                      ? original?.probabilitySeverePct
                      : mode === "ProbTor"
                        ? original?.probabilityTornadoPct
                        : mode === "ProbHail"
                          ? original?.probabilityHailPct
                          : original?.probabilityWindPct;
                return (
                  <tr key={sample.time}>
                    <td className="py-1">{new Date(sample.time).toLocaleTimeString()}</td>
                    <td>{value ?? "Unavailable"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={notifications}
          onChange={(event) => setNotifications(event.target.checked)}
        />
        Show LandDraft rapid-intensification notices
      </label>
      {notifications && analysis.trend.rapid && (
        <div role="status" className="rounded-lg border border-primary bg-primary/5 p-3">
          <strong>LANDDRAFT ANALYSIS: RAPID INTENSIFICATION DETECTED</strong>
          <p>
            +{analysis.trend.change} over {analysis.trend.durationMinutes}m · Confidence{" "}
            {analysis.confidence}. {analysis.drivers.join(" ")}
          </p>
          <p>Analytical notification, not an official NWS warning.</p>
        </div>
      )}
    </section>
  );
}
