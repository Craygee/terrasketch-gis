import { Tag } from "lucide-react";
import { useWorkbench } from "@/lib/gis/store";
import type { FillPattern, GisLayer, StrokePattern } from "@/lib/gis/types";
import { LABEL_TOKENS, propertyKeys } from "@/lib/gis/labels";
import { cn } from "@/lib/utils";

const patterns: FillPattern[] = [
  "solid",
  "diagonal",
  "horizontal",
  "vertical",
  "crosshatch",
  "dotted",
];
const strokePatterns: Array<{ value: StrokePattern; label: string }> = [
  { value: "solid", label: "Regular" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

export function StyleEditor({ layer }: { layer: GisLayer }) {
  const wb = useWorkbench();
  const s = layer.style;
  const keys = propertyKeys(layer.data.features as never).slice(0, 24);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-secondary/40 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fill color">
          <input
            type="color"
            value={s.fillColor}
            onChange={(e) => wb.updateStyle(layer.id, { fillColor: e.target.value })}
            className="h-8 w-full cursor-pointer rounded-lg border border-border bg-card"
            aria-label="Fill color"
          />
        </Field>
        <Field label="Stroke color">
          <input
            type="color"
            value={s.strokeColor}
            onChange={(e) => wb.updateStyle(layer.id, { strokeColor: e.target.value })}
            className="h-8 w-full cursor-pointer rounded-lg border border-border bg-card"
            aria-label="Stroke color"
          />
        </Field>
      </div>

      <Field label="Stroke pattern">
        <div className="grid grid-cols-3 gap-1">
          {strokePatterns.map((pattern) => (
            <button
              key={pattern.value}
              onClick={() => wb.updateStyle(layer.id, { strokePattern: pattern.value })}
              className={cn(
                "rounded-lg border px-2 py-1 text-[11px] transition-colors",
                (s.strokePattern ?? "solid") === pattern.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              <span
                className="mx-auto mb-1 block w-8 border-t-2"
                style={{
                  borderColor: "currentColor",
                  borderTopStyle: pattern.value === "solid" ? "solid" : pattern.value,
                }}
              />
              {pattern.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={`Fill opacity ${Math.round(s.fillOpacity * 100)}%`}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.fillOpacity}
            onChange={(e) => wb.updateStyle(layer.id, { fillOpacity: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-primary"
          />
          <button
            onClick={() =>
              wb.updateStyle(layer.id, { fillOpacity: s.fillOpacity === 0 ? 0.35 : 0 })
            }
            aria-pressed={s.fillOpacity === 0}
            className={cn(
              "shrink-0 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors",
              s.fillOpacity === 0
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-accent",
            )}
          >
            No fill
          </button>
        </div>
      </Field>

      <Field label="Fill pattern">
        <div className="grid grid-cols-3 gap-1">
          {patterns.map((p) => (
            <button
              key={p}
              onClick={() => wb.updateStyle(layer.id, { fillPattern: p })}
              className={cn(
                "rounded-lg border px-1 py-1 text-[11px] capitalize transition-colors",
                s.fillPattern === p
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Stroke ${s.strokeWidth}px`}>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={s.strokeWidth}
            onChange={(e) => wb.updateStyle(layer.id, { strokeWidth: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </Field>
        <Field label={`Point size ${s.pointSize}px`}>
          <input
            type="range"
            min={2}
            max={20}
            step={1}
            value={s.pointSize}
            onChange={(e) => wb.updateStyle(layer.id, { pointSize: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </Field>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={s.labelEnabled}
            onChange={(e) => wb.updateStyle(layer.id, { labelEnabled: e.target.checked })}
            className="accent-primary"
          />
          <Tag className="size-3.5 text-primary" /> Show labels
        </label>
        <input
          value={s.labelTemplate}
          onChange={(e) => wb.updateStyle(layer.id, { labelTemplate: e.target.value })}
          placeholder="{OWNER} · {ACRES} acres"
          aria-label="Label template"
          className="num w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
        <div className="flex flex-wrap gap-1">
          {Array.from(new Set([...LABEL_TOKENS, ...keys]))
            .slice(0, 20)
            .map((token) => (
              <button
                key={token}
                onClick={() =>
                  wb.updateStyle(layer.id, {
                    labelTemplate: `${s.labelTemplate}${s.labelTemplate ? " · " : ""}{${token}}`,
                    labelEnabled: true,
                  })
                }
                className="num rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {`{${token}}`}
              </button>
            ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Labels start at zoom ${s.labelMinZoom}`}>
            <input
              type="range"
              min={0}
              max={18}
              step={1}
              value={s.labelMinZoom}
              onChange={(e) => wb.updateStyle(layer.id, { labelMinZoom: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </Field>
          <Field label={`Labels end at zoom ${s.labelMaxZoom}`}>
            <input
              type="range"
              min={6}
              max={24}
              step={1}
              value={s.labelMaxZoom}
              onChange={(e) => wb.updateStyle(layer.id, { labelMaxZoom: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
