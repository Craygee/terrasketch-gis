import { Clock3, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeatherTimelineState } from "@/lib/weather/types";

type WeatherTimelineFrame = { id: string; timestamp: string };

function frameIndex(frames: WeatherTimelineFrame[], selectedTime: string) {
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
  frames,
  onChange,
  compact = false,
}: {
  timeline: WeatherTimelineState;
  frames: WeatherTimelineFrame[];
  onChange: (change: Partial<WeatherTimelineState>) => void;
  compact?: boolean;
}) {
  const index = frameIndex(frames, timeline.selectedTime);
  const frame = frames[index];
  const move = (direction: -1 | 1) => {
    if (!frames.length) return;
    const next = Math.max(0, Math.min(frames.length - 1, index + direction));
    onChange({ selectedTime: frames[next]!.timestamp, playing: false });
  };

  if (!frames.length) {
    return (
      <div
        className="flex h-9 items-center justify-center gap-2 rounded-xl bg-secondary/70 px-3 text-[9px] text-muted-foreground"
        aria-label="Weather timeline"
      >
        <Clock3 className="size-3.5" />
        <strong className="font-semibold text-foreground">Weather timeline</strong>
        <span>· Turn on a time-enabled layer to view history</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/95 shadow-float backdrop-blur",
        "p-2",
      )}
      aria-label="Weather timeline"
    >
      <div className="flex items-center gap-1.5">
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          onClick={() => onChange({ playing: !timeline.playing })}
          aria-label={timeline.playing ? "Pause weather animation" : "Play weather animation"}
          title={timeline.playing ? "Pause" : "Play"}
          disabled={frames.length < 2}
        >
          {timeline.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40"
          onClick={() => move(-1)}
          disabled={!frames.length || index === 0}
          aria-label="Previous frame"
          title="Previous frame"
        >
          <SkipBack className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Past</span>
            <span className="mx-auto text-primary">Weather time</span>
            <span>Now</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            step={1}
            value={index}
            disabled={!frames.length}
            onChange={(event) => {
              const next = frames[Number(event.target.value)];
              if (next) onChange({ selectedTime: next.timestamp, playing: false });
            }}
            className="h-2 w-full cursor-pointer accent-primary disabled:opacity-40"
            aria-label="Weather frame"
          />
        </div>
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40"
          onClick={() => move(1)}
          disabled={!frames.length || index === frames.length - 1}
          aria-label="Next frame"
          title="Next frame"
        >
          <SkipForward className="size-3.5" />
        </button>
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40"
          onClick={() => {
            const latest = frames.at(-1);
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
          : "No time-enabled layer is loaded here"}
      </div>
    </div>
  );
}
