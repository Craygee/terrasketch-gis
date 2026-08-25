import { ChevronRight, Tag, X } from "lucide-react";
import { useWorkbench } from "@/lib/gis/store";
import type { FillPattern, GisLayer, StrokePattern } from "@/lib/gis/types";
import {
  buildLabelTemplate,
  labelFieldsFromTemplate,
  LABEL_TOKENS,
  propertyKeys,
} from "@/lib/gis/labels";
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

const categoryPalette = [
  "#2f7d4f",
  "#d17b2f",
  "#3973ad",
  "#93528c",
  "#bd4d43",
  "#2f8984",
  "#8268b2",
  "#a78431",
];

const categoryValues = (layer: GisLayer, field: string) =>
  Array.from(
    new Set(layer.data.features.map((feature) => String(feature.properties?.[field] ?? ""))),
  )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, 100);

export function StyleEditor({ layer }: { layer: GisLayer }) {
  const wb = useWorkbench();
  const s = layer.style;
  const keys = propertyKeys(layer.data.features as never).filter((key) => !key.startsWith("__"));
  const availableFields = Array.from(new Set([...keys, ...LABEL_TOKENS]));
  const selectedFields =
    s.labelFields?.length > 0 ? s.labelFields : labelFieldsFromTemplate(s.labelTemplate);
  const separator = s.labelSeparator || " · ";
  const categorized = s.categorized;

  const applyCategoryField = (field: string) => {
    if (!field) {
      if (categorized)
        wb.updateStyle(layer.id, { categorized: { ...categorized, enabled: false } });
      return;
    }
    const existing = new Map(categorized?.rules.map((rule) => [rule.value, rule]));
    const values = categoryValues(layer, field);
    wb.updateStyle(layer.id, {
      categorized: {
        enabled: true,
        field,
        rules: values.map(
          (value, index) =>
            existing.get(value) ?? {
              value,
              label: value || "No value",
              color: categoryPalette[index % categoryPalette.length] ?? "#2f7d4f",
              visible: true,
            },
        ),
        fallbackColor: categorized?.fallbackColor ?? s.fillColor,
        fallbackVisible: categorized?.fallbackVisible ?? true,
      },
    });
  };

  const applyLabelFields = (fields: string[], nextSeparator = separator) => {
    const unique = Array.from(new Set(fields.filter(Boolean))).slice(0, 4);
    wb.updateStyle(layer.id, {
      labelFields: unique,
      labelSeparator: nextSeparator,
      labelTemplate: buildLabelTemplate(unique, nextSeparator),
      labelEnabled: unique.length > 0,
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fill color">
          <input
            type="color"
            value={s.fillColor}
            onChange={(event) => wb.updateStyle(layer.id, { fillColor: event.target.value })}
            className="h-8 w-full cursor-pointer rounded-lg border border-border bg-card"
            aria-label="Fill color"
          />
        </Field>
        <Field label="Stroke color">
          <input
            type="color"
            value={s.strokeColor}
            onChange={(event) => wb.updateStyle(layer.id, { strokeColor: event.target.value })}
            className="h-8 w-full cursor-pointer rounded-lg border border-border bg-card"
            aria-label="Stroke color"
          />
        </Field>
      </div>

      <Field label={`Fill opacity ${Math.round(s.fillOpacity * 100)}%`}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.fillOpacity}
            onChange={(event) =>
              wb.updateStyle(layer.id, { fillOpacity: Number(event.target.value) })
            }
            className="min-w-0 flex-1 accent-primary"
          />
          <button
            onClick={() =>
              wb.updateStyle(layer.id, { fillOpacity: s.fillOpacity === 0 ? 0.35 : 0 })
            }
            aria-pressed={s.fillOpacity === 0}
            className={cn(
              "shrink-0 rounded-lg border px-2 py-1 text-[11px] font-medium",
              s.fillOpacity === 0
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-accent",
            )}
          >
            No fill
          </button>
        </div>
      </Field>

      <section className="space-y-2 border-t border-border pt-3">
        <Field label="Color features by attribute">
          <select
            value={categorized?.enabled ? categorized.field : ""}
            onChange={(event) => applyCategoryField(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
          >
            <option value="">Single layer color</option>
            {keys.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </Field>
        {categorized?.enabled && (
          <details className="group rounded-lg border border-border bg-card/70">
            <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1.5 text-[11px] font-medium">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
              {categorized.rules.length} value colors
            </summary>
            <div className="max-h-64 space-y-1 overflow-y-auto border-t border-border p-2">
              {categorized.rules.map((rule, index) => (
                <div
                  key={rule.value}
                  className="flex items-center gap-2 rounded-lg bg-secondary/70 p-1.5"
                >
                  <input
                    type="checkbox"
                    checked={rule.visible}
                    onChange={(event) =>
                      wb.updateStyle(layer.id, {
                        categorized: {
                          ...categorized,
                          rules: categorized.rules.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, visible: event.target.checked } : item,
                          ),
                        },
                      })
                    }
                    aria-label={`Show ${rule.label}`}
                    className="accent-primary"
                  />
                  <input
                    type="color"
                    value={rule.color}
                    onChange={(event) =>
                      wb.updateStyle(layer.id, {
                        categorized: {
                          ...categorized,
                          rules: categorized.rules.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, color: event.target.value } : item,
                          ),
                        },
                      })
                    }
                    aria-label={`Color for ${rule.label}`}
                    className="h-6 w-7 cursor-pointer rounded border border-border bg-card"
                  />
                  <span className="min-w-0 flex-1 truncate text-[10px]" title={rule.value}>
                    {rule.label}
                  </span>
                </div>
              ))}
              <button
                onClick={() => applyCategoryField(categorized.field)}
                className="w-full rounded-lg border border-border px-2 py-1 text-[10px] hover:bg-accent"
              >
                Refresh values from loaded features
              </button>
              {layer.data.features.length > 0 && categorized.rules.length >= 100 && (
                <p className="text-[9px] text-muted-foreground">
                  Showing the first 100 values; unmatched values use the fallback color.
                </p>
              )}
            </div>
          </details>
        )}
      </section>

      <section className="space-y-2 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={s.labelEnabled}
            disabled={!s.labelTemplate.trim()}
            onChange={(event) => wb.updateStyle(layer.id, { labelEnabled: event.target.checked })}
            className="accent-primary"
          />
          <Tag className="size-3.5 text-primary" /> Show labels
        </label>

        <label className="block text-[11px] font-medium text-muted-foreground">
          Label from attribute fields
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) applyLabelFields([...selectedFields, event.target.value]);
            }}
            aria-label="Add label attribute field"
            className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
          >
            <option value="">Choose a field…</option>
            {availableFields
              .filter((field) => !selectedFields.includes(field))
              .map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
          </select>
        </label>

        {selectedFields.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selectedFields.map((field) => (
              <span
                key={field}
                className="num flex items-center gap-1 rounded-full bg-card px-2 py-1 text-[10px]"
              >
                {field}
                <button
                  onClick={() => applyLabelFields(selectedFields.filter((item) => item !== field))}
                  aria-label={`Remove ${field} from labels`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Choose one or more fields to label every feature.
          </p>
        )}

        <details className="group rounded-lg border border-border bg-card/70">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1.5 text-[11px] font-medium">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
            Advanced labeling
          </summary>
          <div className="space-y-2 border-t border-border p-2">
            <Field label="Field separator">
              <select
                value={separator}
                onChange={(event) => applyLabelFields(selectedFields, event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-2 py-1 text-xs"
              >
                <option value=" · ">Dot · separator</option>
                <option value=", ">Comma separator</option>
                <option value=" — ">Dash separator</option>
                <option value=" / ">Slash separator</option>
                <option value="\n">New line</option>
                <option value=" ">Space</option>
              </select>
            </Field>
            <Field label="Custom label template">
              <input
                value={s.labelTemplate}
                onChange={(event) =>
                  wb.updateStyle(layer.id, {
                    labelTemplate: event.target.value,
                    labelFields: labelFieldsFromTemplate(event.target.value),
                  })
                }
                placeholder="{OWNER} · {ACRES} acres"
                aria-label="Custom label template"
                className="num w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs outline-none focus:border-primary"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={`Start zoom ${s.labelMinZoom}`}>
                <input
                  type="range"
                  min={0}
                  max={18}
                  step={1}
                  value={s.labelMinZoom}
                  onChange={(event) =>
                    wb.updateStyle(layer.id, { labelMinZoom: Number(event.target.value) })
                  }
                  className="w-full accent-primary"
                />
              </Field>
              <Field label={`End zoom ${s.labelMaxZoom}`}>
                <input
                  type="range"
                  min={6}
                  max={24}
                  step={1}
                  value={s.labelMaxZoom}
                  onChange={(event) =>
                    wb.updateStyle(layer.id, { labelMaxZoom: Number(event.target.value) })
                  }
                  className="w-full accent-primary"
                />
              </Field>
            </div>
          </div>
        </details>
      </section>

      <details className="group border-t border-border pt-2">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-semibold">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          Advanced symbology
        </summary>
        <div className="mt-3 space-y-3">
          <Field label="Stroke pattern">
            <div className="grid grid-cols-3 gap-1">
              {strokePatterns.map((pattern) => (
                <button
                  key={pattern.value}
                  onClick={() => wb.updateStyle(layer.id, { strokePattern: pattern.value })}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[11px]",
                    (s.strokePattern ?? "solid") === pattern.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-accent",
                  )}
                >
                  {pattern.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Fill pattern">
            <div className="grid grid-cols-3 gap-1">
              {patterns.map((pattern) => (
                <button
                  key={pattern}
                  onClick={() => wb.updateStyle(layer.id, { fillPattern: pattern })}
                  className={cn(
                    "rounded-lg border px-1 py-1 text-[11px] capitalize",
                    s.fillPattern === pattern
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-accent",
                  )}
                >
                  {pattern}
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
                onChange={(event) =>
                  wb.updateStyle(layer.id, { strokeWidth: Number(event.target.value) })
                }
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
                onChange={(event) =>
                  wb.updateStyle(layer.id, { pointSize: Number(event.target.value) })
                }
                className="w-full accent-primary"
              />
            </Field>
          </div>
        </div>
      </details>
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
