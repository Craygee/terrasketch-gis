import { useId, useMemo, useRef } from "react";
import type { PipelineProfilePoint } from "@/lib/pipeline/types";
import { pipelineUnits } from "@/lib/pipeline/model";

const WIDTH = 1_000;
const HEIGHT = 190;
const PADDING = { left: 54, right: 42, top: 20, bottom: 32 };

function pathFor(values: Array<number | undefined>, min: number, max: number) {
  const drawableWidth = WIDTH - PADDING.left - PADDING.right;
  const drawableHeight = HEIGHT - PADDING.top - PADDING.bottom;
  let started = false;
  return values
    .map((value, index) => {
      if (value === undefined) return "";
      const x = PADDING.left + (index / Math.max(1, values.length - 1)) * drawableWidth;
      const y = PADDING.top + (1 - (value - min) / Math.max(1e-9, max - min)) * drawableHeight;
      const command = started ? "L" : "M";
      started = true;
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
}

export function PipelineProfile({
  profile,
  scrubStationM,
  onScrub,
}: {
  profile: PipelineProfilePoint[];
  scrubStationM: number | null;
  onScrub: (stationM: number | null) => void;
}) {
  const frame = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const metrics = useMemo(() => {
    const pressure = profile.map((point) => point.pressurePa * pipelineUnits.paToPsi);
    const elevation = profile
      .map((point) => point.pipelineElevationM ?? point.groundElevationM)
      .map((value) => (value === undefined ? undefined : value * pipelineUnits.mToFt));
    const finiteElevation = elevation.filter((value): value is number => value !== undefined);
    const minPressure = pressure.length ? Math.min(...pressure) : 0;
    const maxPressure = pressure.length ? Math.max(...pressure) : 1;
    const minElevation = finiteElevation.length ? Math.min(...finiteElevation) : 0;
    const maxElevation = finiteElevation.length ? Math.max(...finiteElevation) : 1;
    return {
      pressure,
      elevation,
      minPressure,
      maxPressure,
      minElevation,
      maxElevation,
      pressurePath: pathFor(pressure, minPressure, maxPressure),
      elevationPath: pathFor(elevation, minElevation, maxElevation),
    };
  }, [profile]);
  const endStationM = profile.at(-1)?.stationM ?? 0;
  const scrubX =
    scrubStationM === null || endStationM <= 0
      ? null
      : PADDING.left + (scrubStationM / endStationM) * (WIDTH - PADDING.left - PADDING.right);

  const move = (clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || !endStationM) return;
    const localX = ((clientX - rect.left) / rect.width) * WIDTH;
    const ratio = Math.max(
      0,
      Math.min(1, (localX - PADDING.left) / (WIDTH - PADDING.left - PADDING.right)),
    );
    onScrub(ratio * endStationM);
  };

  if (profile.length < 2)
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        Choose a line route and run a supported scenario to create the engineering profile.
      </div>
    );

  return (
    <svg
      ref={frame}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-44 w-full touch-none"
      onPointerMove={(event) => move(event.clientX)}
      onPointerLeave={() => onScrub(null)}
      aria-label="Synchronized pipeline elevation and pressure profile"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#177542" stopOpacity="0.2" />
          <stop offset="1" stopColor="#177542" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#fdfbf3" />
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const x = PADDING.left + ratio * (WIDTH - PADDING.left - PADDING.right);
        return (
          <g key={ratio}>
            <line x1={x} x2={x} y1={PADDING.top} y2={HEIGHT - PADDING.bottom} stroke="#dedbcf" />
            <text x={x} y={HEIGHT - 10} textAnchor="middle" fontSize="11" fill="#657067">
              {(endStationM * ratio * pipelineUnits.mToMi).toFixed(1)} mi
            </text>
          </g>
        );
      })}
      <path d={metrics.elevationPath} fill="none" stroke="#8b8170" strokeWidth="2" />
      <path d={metrics.pressurePath} fill="none" stroke="#177542" strokeWidth="3" />
      {scrubX !== null && (
        <line
          x1={scrubX}
          x2={scrubX}
          y1={PADDING.top}
          y2={HEIGHT - PADDING.bottom}
          stroke="#17221a"
          strokeWidth="2"
        />
      )}
      <text x="8" y="18" fontSize="11" fill="#177542">
        Pressure {metrics.minPressure.toFixed(0)}–{metrics.maxPressure.toFixed(0)} psi
      </text>
      <text x={WIDTH - 8} y="18" textAnchor="end" fontSize="11" fill="#6b6255">
        Elev. {metrics.minElevation.toFixed(0)}–{metrics.maxElevation.toFixed(0)} ft
      </text>
    </svg>
  );
}
