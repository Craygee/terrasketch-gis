import { useMemo, useState } from "react";
import { ArrowUp, CheckSquare, Database, FileText, Layers3, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { exportAnalysisReportPdf } from "@/lib/gis/mapPdf";
import type { GisLayer } from "@/lib/gis/types";
import { propertyKeys } from "@/lib/gis/labels";

type Operator = "contains" | "equals" | "starts" | "greater" | "less";
type Message = { role: "assistant" | "user"; text: string };

const starters = [
  "Summarize this project",
  "Find public parcel data",
  "Select features where ACRES > 10",
  "Create a report from my selection",
];

export function AiAssistant() {
  const wb = useWorkbench();
  const { assistantOpen, setAssistantOpen, setDrawerOpen, setPendingCatalogQuery, map } =
    useMapRef();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Ask me to search attributes, select features, make a derived layer, find public data, create a map report, or explain any LandDraft tool.",
    },
  ]);
  const [builderLayerId, setBuilderLayerId] = useState("");
  const [builderField, setBuilderField] = useState("");
  const [builderOperator, setBuilderOperator] = useState<Operator>("contains");
  const [builderValue, setBuilderValue] = useState("");

  const builderLayer = wb.layers.find((layer) => layer.id === builderLayerId) ?? wb.activeLayer;
  const builderFields = useMemo(
    () =>
      propertyKeys((builderLayer?.data.features ?? []) as never).filter(
        (key) => !key.startsWith("__"),
      ),
    [builderLayer],
  );

  if (!assistantOpen) return null;

  const answer = (text: string) =>
    setMessages((current) => [...current, { role: "assistant", text }]);

  const executeFilter = (
    layer: GisLayer,
    field: string,
    operator: Operator,
    value: string,
    createLayer: boolean,
  ) => {
    const matches = layer.data.features
      .map((feature, index) => ({ feature, index }))
      .filter(({ feature }) => compare((feature.properties ?? {})[field], operator, value));
    wb.setSelectedFeatures(matches.map(({ index }) => ({ layerId: layer.id, index })));
    if (createLayer && matches.length) {
      const created = wb.addLayer({
        name: `${layer.name} · ${field} ${operatorLabel(operator)} ${value}`,
        groupId: wb.derivedLayerGroupId,
        source: {
          kind: "derived",
          sourceLayerId: layer.id,
          query: `${field} ${operator} ${value}`,
        },
        data: {
          type: "FeatureCollection",
          features: matches.map(({ feature }) => structuredClone(feature)),
        },
        style: layer.style,
      });
      return {
        count: matches.length,
        created: created.name,
        features: matches.map(({ feature }) => feature),
      };
    }
    return { count: matches.length, features: matches.map(({ feature }) => feature) };
  };

  const createReport = async (summary: string, resultFeatures?: GisLayer["data"]["features"]) => {
    if (!map) throw new Error("The map is still opening");
    const selected = wb.selectedFeatures.flatMap((selection) => {
      const layer = wb.layers.find((item) => item.id === selection.layerId);
      const feature = layer?.data.features[selection.index];
      return feature ? [feature] : [];
    });
    const layer = wb.activeLayer;
    const features = resultFeatures?.length
      ? resultFeatures
      : selected.length
        ? selected
        : (layer?.data.features ?? []);
    await exportAnalysisReportPdf(map, wb.projectName, wb.layers, {
      title: `${wb.projectName} · GIS analysis`,
      summary,
      features,
      ...(selected.length
        ? { sourceLayerName: "Current selection" }
        : layer?.name
          ? { sourceLayerName: layer.name }
          : {}),
    });
    return features.length;
  };

  const run = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setPrompt("");
    setMessages((current) => [...current, { role: "user", text }]);
    const lower = text.toLowerCase();
    try {
      if (/\b(report|pdf|brief)\b/.test(lower)) {
        const reportLayer = findMentionedLayer(text, wb.layers, wb.activeLayer);
        const reportCondition = reportLayer ? parseCondition(text, reportLayer) : null;
        const filtered =
          reportLayer && reportCondition
            ? executeFilter(
                reportLayer,
                reportCondition.field,
                reportCondition.operator,
                reportCondition.value,
                false,
              )
            : null;
        const count = await createReport(
          `Requested analysis: ${text}. The map reflects the current view and visible layer stack; the result summary uses the current feature selection when one exists.`,
          filtered?.features,
        );
        answer(
          `Created a PDF report with the current map, visible-layer legend, and ${count.toLocaleString()} result feature${count === 1 ? "" : "s"}.`,
        );
        return;
      }
      if (
        /\b(public data|dataset|repository|find data|parcel data|flood data|well data)\b/.test(
          lower,
        )
      ) {
        const query = text
          .replace(
            /\b(find|show|open|search|add|me|public|data|datasets?|repositories|for)\b/gi,
            " ",
          )
          .replace(/\s+/g, " ")
          .trim();
        setPendingCatalogQuery(query);
        setDrawerOpen(true);
        answer(
          `Opened the public-data library${query ? ` and searched for “${query}”` : ""}. Use Ready-to-add for direct services or Search repositories for the nationwide government catalog.`,
        );
        return;
      }
      const layer = findMentionedLayer(text, wb.layers, wb.activeLayer);
      const parsed = layer ? parseCondition(text, layer) : null;
      if (layer && parsed) {
        const createLayer = /\b(create|make|new|add)\b.*\blayer\b|\blayer\b.*\bfrom\b/.test(lower);
        const result = executeFilter(
          layer,
          parsed.field,
          parsed.operator,
          parsed.value,
          createLayer,
        );
        answer(
          result.created
            ? `Found ${result.count.toLocaleString()} matches and created “${result.created}” in the default derived-layer group with a consistent alternate color and 50% fill opacity.`
            : `Selected ${result.count.toLocaleString()} matching feature${result.count === 1 ? "" : "s"} in “${layer.name}”. You can now inspect the table, create a layer, or ask me for a report.`,
        );
        return;
      }
      const help = helpAnswer(lower);
      if (help) {
        answer(help);
        return;
      }
      const featureCount = wb.layers.reduce((total, item) => total + item.data.features.length, 0);
      const visible = wb.layers.filter((item) => item.visible).length;
      answer(
        `“${wb.projectName}” has ${wb.layers.length} layers (${visible} visible), ${wb.groups.length} groups or subgroups, and ${featureCount.toLocaleString()} currently loaded features. For a table query, include a field and condition such as “select parcels where ACRES > 10.”`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "The request could not be completed";
      answer(message);
      toast.error("AI action could not finish", { description: message });
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[90] flex" role="dialog" aria-modal="true">
      <button
        className="flex-1 bg-foreground/20 backdrop-blur-[2px]"
        aria-label="Close AI"
        title="Close the AI assistant"
        onClick={() => setAssistantOpen(false)}
      />
      <aside
        className="panel-surface flex h-full w-full max-w-md flex-col overflow-hidden md:rounded-l-2xl"
        aria-label="LandDraft AI assistant"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">LandDraft AI</h2>
            <p className="text-[10px] text-muted-foreground">
              GIS actions, answers and map reports
            </p>
          </div>
          <button
            onClick={() => setAssistantOpen(false)}
            aria-label="Close AI"
            title="Close the AI assistant"
            className="ml-auto rounded-lg p-1.5 hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={
                message.role === "user"
                  ? "ml-10 rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-xs text-primary-foreground"
                  : "mr-6 rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-xs leading-relaxed"
              }
            >
              {message.text}
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            {starters.map((starter) => (
              <button
                key={starter}
                onClick={() => void run(starter)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] hover:border-primary"
              >
                {starter}
              </button>
            ))}
          </div>

          <details className="group rounded-xl border border-border bg-card">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold">
              Advanced · precise table query
            </summary>
            <div className="space-y-2 border-t border-border p-3">
              <select
                value={builderLayer?.id ?? ""}
                onChange={(event) => {
                  setBuilderLayerId(event.target.value);
                  setBuilderField("");
                }}
                className="w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs"
              >
                <option value="">Choose layer</option>
                {wb.layers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-[1fr_auto] gap-1">
                <select
                  value={builderField}
                  onChange={(event) => setBuilderField(event.target.value)}
                  className="min-w-0 rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs"
                >
                  <option value="">Attribute field</option>
                  {builderFields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
                <select
                  value={builderOperator}
                  onChange={(event) => setBuilderOperator(event.target.value as Operator)}
                  className="rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs"
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="starts">starts with</option>
                  <option value="greater">&gt;</option>
                  <option value="less">&lt;</option>
                </select>
              </div>
              <input
                value={builderValue}
                onChange={(event) => setBuilderValue(event.target.value)}
                placeholder="Value"
                className="w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs outline-none focus:border-primary"
              />
              <div className="grid grid-cols-2 gap-1">
                <button
                  disabled={!builderLayer || !builderField}
                  onClick={() => {
                    if (!builderLayer || !builderField) return;
                    const result = executeFilter(
                      builderLayer,
                      builderField,
                      builderOperator,
                      builderValue,
                      false,
                    );
                    answer(
                      `Selected ${result.count.toLocaleString()} matching features in “${builderLayer.name}”.`,
                    );
                  }}
                  className="flex items-center justify-center gap-1 rounded-lg bg-secondary px-2 py-1.5 text-[11px] disabled:opacity-40"
                >
                  <CheckSquare className="size-3.5" /> Select
                </button>
                <button
                  disabled={!builderLayer || !builderField}
                  onClick={() => {
                    if (!builderLayer || !builderField) return;
                    const result = executeFilter(
                      builderLayer,
                      builderField,
                      builderOperator,
                      builderValue,
                      true,
                    );
                    answer(
                      result.created
                        ? `Created “${result.created}” with ${result.count.toLocaleString()} features.`
                        : "No matching features were found.",
                    );
                  }}
                  className="flex items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] text-primary-foreground disabled:opacity-40"
                >
                  <Layers3 className="size-3.5" /> New layer
                </button>
              </div>
            </div>
          </details>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setPendingCatalogQuery("");
                setDrawerOpen(true);
              }}
              className="flex items-center justify-center gap-1 rounded-xl bg-secondary px-2 py-2 text-[11px]"
            >
              <Database className="size-3.5" /> Find public data
            </button>
            <button
              onClick={() => void run("Create a report from my selection")}
              className="flex items-center justify-center gap-1 rounded-xl bg-secondary px-2 py-2 text-[11px]"
            >
              <FileText className="size-3.5" /> Map report
            </button>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(prompt);
          }}
          className="border-t border-border p-3"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:border-primary">
            <textarea
              autoFocus
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void run(prompt);
                }
              }}
              placeholder="Ask about this map or tell me what to do…"
              rows={2}
              className="pointer-events-auto relative z-10 min-h-10 flex-1 resize-none bg-transparent px-1 text-xs outline-none"
            />
            <button
              type="submit"
              disabled={!prompt.trim()}
              aria-label="Send request"
              title="Send this request to LandDraft AI"
              className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[9px] text-muted-foreground">
            Review AI-assisted selections and public records before relying on them.
          </p>
        </form>
      </aside>
    </div>
  );
}

function findMentionedLayer(text: string, layers: GisLayer[], active: GisLayer | null) {
  const lower = text.toLowerCase();
  return (
    [...layers]
      .sort((a, b) => b.name.length - a.name.length)
      .find((layer) => lower.includes(layer.name.toLowerCase())) ??
    active ??
    layers[0]
  );
}

function parseCondition(
  text: string,
  layer: GisLayer,
): { field: string; operator: Operator; value: string } | null {
  const fields = propertyKeys(layer.data.features as never).sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const field = fields.find((candidate) => lower.includes(candidate.toLowerCase()));
  if (!field) return null;
  const after = text.slice(lower.indexOf(field.toLowerCase()) + field.length);
  const match = after.match(
    /\s*(?:is\s*)?(>=|<=|>|<|=|equals?|contains?|starts\s+with)\s*["']?([^"']+?)["']?(?:\s+(?:and\s+)?(?:create|make|as|into)\b.*)?$/i,
  );
  if (!match) return null;
  const rawOperator = match[1]?.toLowerCase() ?? "contains";
  const operator: Operator =
    rawOperator === ">" || rawOperator === ">="
      ? "greater"
      : rawOperator === "<" || rawOperator === "<="
        ? "less"
        : rawOperator.startsWith("equal") || rawOperator === "="
          ? "equals"
          : rawOperator.startsWith("start")
            ? "starts"
            : "contains";
  return { field, operator, value: (match[2] ?? "").trim() };
}

function compare(raw: unknown, operator: Operator, expected: string) {
  const value = String(raw ?? "");
  if (operator === "greater" || operator === "less") {
    const left = Number(value.replaceAll(",", ""));
    const right = Number(expected.replaceAll(",", ""));
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    return operator === "greater" ? left > right : left < right;
  }
  const left = value.toLowerCase();
  const right = expected.toLowerCase();
  if (operator === "equals") return left === right;
  if (operator === "starts") return left.startsWith(right);
  return left.includes(right);
}

const operatorLabel = (operator: Operator) =>
  ({ contains: "contains", equals: "=", starts: "starts with", greater: ">", less: "<" })[operator];

function helpAnswer(prompt: string): string | null {
  if (/\b(import|kml|kmz|shp|shapefile|csv|gpx)\b/.test(prompt))
    return "Drop GeoJSON, KML, KMZ, zipped Shapefile, GPX or CSV files onto the Layers panel. LandDraft adds them to Imported files and zooms to the first result.";
  if (/\b(label|labels|attribute label)\b/.test(prompt))
    return "Expand a layer, open Style, choose one or more label attribute fields, and switch labels on. Advanced labeling controls separators and zoom visibility.";
  if (/\b(group|subgroup|folder)\b/.test(prompt))
    return "Use the folder-plus button to create a group, or the smaller folder-plus on any group to create a subgroup. Collapse with the caret; the eye and palette apply to the whole branch.";
  if (/\b(snap|snapping|draw)\b/.test(prompt))
    return "Turn on Snap in the draw toolbar, then add a point, line or area. New vertices snap to nearby visible features; GPS point uses your device location when permission is available.";
  if (/\b(export|kmz|pdf|shp)\b/.test(prompt))
    return "Open Export in the top bar for map PDF, GeoJSON, KML, KMZ or Shapefile output. A LandDraft AI report adds the current map, legend and selected attributes.";
  if (/\b(parcel|ownership|tax)\b/.test(prompt))
    return "Open Public data, choose the project states, search parcel, and use a county filter where the publisher supports it. Parcel fills start transparent and stream only for the visible area at a close zoom.";
  return null;
}
