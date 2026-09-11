import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RadarFrame, WeatherTimelineState } from "@/lib/weather/types";

function frameIndex(frames: RadarFrame[], selectedTime: string) {
  if (!frames.length) return 0;
  const target = new Date(selectedTime).getTime();
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  frames.forEach((frame, index) => {
    const nextDistance = Math.abs(new Date(frame.timestamp).getTime() - target);
    if (nextDistance < distance) {
      distance = nextDistance;
      best = index;
    }
  });
  return best;
}

export function WeatherTimeline({
  timeline,
  radarFrames,
  onChange,
  compact = false,
}: {
  timeline: WeatherTimelineState;
  radarFrames: RadarFrame[];
  onChange: (change: Partial<WeatherTimelineState>) => void;
  compact?: boolean;
}) {
  const index = frameIndex(radarFrames, timeline.selectedTime);
  const frame = radarFrames[index];
  const move = (direction: -1 | 1) => {
    if (!radarFrames.length) return;
    const next = Math.max(0, Math.min(radarFrames.length - 1, index + direction));
    onChange({ selectedTime: radarFrames[next]!.timestamp, playing: false });
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/95 shadow-float backdrop-blur",
        compact ? "p-2" : "p-3",
      )}
      aria-label="Weather timeline"
    >
      <div className="flex items-center gap-1.5">
        <button
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          onClick={() => onChange({ playing: !timeline.playing })}
          aria-label={timeline.playing ? "Pause weather animation" : "Play weather animation"}
          title={timeline.playing ? "Pause" : "Play"}
          disabled={radarFrames.length < 2}
        >
          {timeline.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40"
          onClick={() => move(-1)}
          disabled={!radarFrames.length || index === 0}
          aria-label="Previous frame"
          title="Previous frame"
        >
          <SkipBack className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Past</span>
            <span className="mx-auto text-primary">Observed radar</span>
            <span>Now</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, radarFrames.length - 1)}
            step={1}
            value={index}
            disabled={!radarFrames.length}
            onChange={(event) => {
              const next = radarFrames[Number(event.target.value)];
              if (next) onChange({ selectedTime: next.timestamp, playing: false });
            }}
            className="h-2 w-full cursor-pointer accent-primary disabled:opacity-40"
            aria-label="Weather frame"
          />
        </div>
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40"
          onClick={() => move(1)}
          disabled={!radarFrames.length || index === radarFrames.length - 1}
          aria-label="Next frame"
          title="Next frame"
        >
          <SkipForward className="size-3.5" />
        </button>
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40"
          onClick={() => {
            const latest = radarFrames.at(-1);
            onChange({
              selectedTime: latest?.timestamp ?? new Date().toISOString(),
              playing: false,
            });
          }}
          aria-label="Jump to latest weather"
          title="Jump to latest"
        >
          <RotateCcw className="size-3.5" />
        </button>
        {!compact && (
          <select
            value={timeline.speed}
            onChange={(event) =>
              onChange({ speed: Number(event.target.value) as WeatherTimelineState["speed"] })
            }
            className="h-8 rounded-lg border border-border bg-background px-2 text-[10px]"
            aria-label="Animation speed"
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        )}
      </div>
      <div className="mt-1 text-center text-[9px] text-muted-foreground">
        {frame
          ? new Date(frame.timestamp).toLocaleString([], {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            })
          : "Radar frames unavailable for this location"}
      </div>
    </div>
  );
}
