import { useEffect, useRef, useState } from "react";
import { ArrowUp, Database, FileText, History, Sparkles, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { useWorkbench } from "@/lib/gis/store";
import { useMapRef } from "@/lib/gis/mapRef";
import { exportAnalysisReportPdf } from "@/lib/gis/mapPdf";
import type { AssistantAction, AssistantMessage, GisLayer } from "@/lib/gis/types";
import type { ProjectVersion } from "@/lib/gis/project";
import { propertyKeys } from "@/lib/gis/labels";

type Operator = "contains" | "equals" | "starts" | "greater" | "less";

const starters = [
  "Analyze patterns in this map",
  "How do I rename a layer?",
  "Find public parcel data",
  "Select features where ACRES > 10",
];
const colors = ["#2f7d4f", "#d17b2f", "#3973ad", "#93528c", "#bd4d43", "#2f8984"];
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const makeMessage = (role: AssistantMessage["role"], text: string): AssistantMessage => ({
  id: uid(),
  role,
  text,
  createdAt: Date.now(),
});
const welcome = () => [
  makeMessage(
    "assistant",
    "I’m your LandDraft map assistant. I can explain tools, inspect patterns, query attributes, select features, change common layer settings, find public data, and create map reports. Map-changing requests include three-step undo.",
  ),
];

export function AiAssistant() {
  const wb = useWorkbench();
  const {
    assistantOpen,
    setAssistantOpen,
    setDrawerOpen,
    setPendingCatalogQuery,
    setPendingFeatureSave,
    setTableOpen,
    setAnalysisOpen,
    setPrintOpen,
    map,
  } = useMapRef();
  const [messages, setMessages] = useState<AssistantMessage[]>(
    wb.assistant.messages.length ? wb.assistant.messages : welcome(),
  );
  const [actions, setActions] = useState<AssistantAction[]>(wb.assistant.actions.slice(0, 3));
  const messagesRef = useRef(messages);
  const actionsRef = useRef(actions);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const latestMessageRef = useRef<HTMLDivElement>(null);

  const persist = (nextMessages: AssistantMessage[], nextActions = actionsRef.current) => {
    const trimmedMessages = nextMessages.slice(-80);
    const trimmedActions = nextActions.slice(0, 3);
    messagesRef.current = trimmedMessages;
    actionsRef.current = trimmedActions;
    setMessages(trimmedMessages);
    setActions(trimmedActions);
    wb.setAssistantConversation({ messages: trimmedMessages, actions: trimmedActions });
  };
  const append = (...items: AssistantMessage[]) => persist([...messagesRef.current, ...items]);
  const answer = (text: string) => append(makeMessage("assistant", text));

  useEffect(() => {
    const nextMessages = wb.assistant.messages.length ? wb.assistant.messages : welcome();
    messagesRef.current = nextMessages;
    actionsRef.current = wb.assistant.actions.slice(0, 3);
    setMessages(nextMessages);
    setActions(actionsRef.current);
    // Conversation state is project-scoped and reloads only when switching projects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wb.projectId]);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, running]);

  if (!assistantOpen) return null;

  const recordAction = (request: string, summary: string, version?: ProjectVersion) => {
    if (!version) return;
    persist(messagesRef.current, [
      { id: uid(), request, summary, versionId: version.id, createdAt: Date.now() },
      ...actionsRef.current,
    ]);
  };

  const mutate = async (request: string, summary: string, action: () => void) => {
    const version = await wb.saveProject("manual");
    action();
    recordAction(request, summary, version);
  };

  const undoAction = async (action: AssistantAction) => {
    setRunning(true);
    try {
      await wb.restoreVersion(action.versionId);
      const nextActions = actionsRef.current.filter((item) => item.id !== action.id);
      persist(
        [...messagesRef.current, makeMessage("assistant", `Reverted: ${action.summary}`)],
        nextActions,
      );
      toast.success("AI map change reverted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That change could not be reverted");
    } finally {
      setRunning(false);
    }
  };

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
    wb.setActiveLayer(layer.id);
    if (createLayer && matches.length) {
      const suggestedLayerName = `${layer.name} · ${field} ${operatorLabel(operator)} ${value}`;
      setPendingFeatureSave({
        features: matches.map(({ feature }) => structuredClone(feature)),
        suggestedLayerName,
        defaultGroupId: wb.derivedLayerGroupId,
        source: {
          kind: "derived",
          sourceLayerId: layer.id,
          query: `${field} ${operator} ${value}`,
        },
        style: layer.style,
      });
      return {
        count: matches.length,
        created: suggestedLayerName,
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
    const features = resultFeatures?.length
      ? resultFeatures
      : selected.length
        ? selected
        : (wb.activeLayer?.data.features ?? []);
    await exportAnalysisReportPdf(map, wb.projectName, wb.layers, {
      title: `${wb.projectName} · GIS analysis`,
      summary,
      features,
      ...(selected.length
        ? { sourceLayerName: "Current selection" }
        : wb.activeLayer?.name
          ? { sourceLayerName: wb.activeLayer.name }
          : {}),
    });
    return features.length;
  };

  const run = async (raw: string) => {
    const text = raw.trim();
    if (!text || running) return;
    setRunning(true);
    setPrompt("");
    append(makeMessage("user", text));
    const lower = text.toLowerCase();
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      // Guidance questions must be answered before action matching. Without this,
      // “How do I rename a layer?” is incorrectly treated as an incomplete rename command.
      if (isGuidanceQuestion(lower)) {
        const guidance = helpAnswer(lower);
        answer(
          guidance ??
            "I can guide you through LandDraft’s map, layer, drawing, selection, analysis, print, project, and account tools. Tell me the result you want—for example, “How do I create a layer from selected parcels?”—and I’ll give you the exact controls to use.",
        );
        return;
      }

      const rename = text.match(
        /rename(?: the)?(?: layer)?\s+[“"']?(.+?)[”"']?\s+to\s+[“"']?(.+?)[”"']?$/i,
      );
      if (/\brename\b.*\blayer\b|^rename\b/i.test(text)) {
        if (!rename) {
          answer(
            "Which layer should I rename, and what should its new name be? For example: “Rename Roads to Access routes.”",
          );
          return;
        }
        const layer = findLayerByName(rename[1] ?? "", wb.layers);
        const nextName = (rename[2] ?? "").trim();
        if (!layer) {
          answer(
            `I couldn’t find “${rename[1]}”. Available layers are: ${wb.layers.map((item) => item.name).join(", ") || "none yet"}.`,
          );
          return;
        }
        const summary = `Renamed “${layer.name}” to “${nextName}”`;
        await mutate(text, summary, () => wb.updateLayer(layer.id, { name: nextName }));
        answer(`${summary}. You can also rename a layer by double-clicking its name.`);
        return;
      }

      const visibility = text.match(
        /\b(show|hide|turn on|turn off)\b(?: the)?(?: layer)?\s+[“"']?(.+?)[”"']?$/i,
      );
      if (visibility) {
        const layer = findLayerByName(visibility[2] ?? "", wb.layers);
        if (!layer) {
          answer("Which layer should I show or hide? Please use its name from the Layers panel.");
          return;
        }
        const visible = /show|turn on/i.test(visibility[1] ?? "");
        if (layer.visible === visible) {
          answer(`“${layer.name}” is already ${visible ? "visible" : "hidden"}.`);
          return;
        }
        const summary = `${visible ? "Showed" : "Hid"} “${layer.name}”`;
        await mutate(text, summary, () => wb.toggleVisible(layer.id));
        answer(summary);
        return;
      }

      if (
        /\b(color|colour|style|symboliz|categor)\b.*\b(attribute|field|column|value)\b/.test(lower)
      ) {
        const layer = findMentionedLayer(text, wb.layers, wb.activeLayer);
        if (!layer) {
          answer("Which layer should I color by attribute? Select a layer or include its name.");
          return;
        }
        const fields = propertyKeys(layer.data.features as never).filter(
          (field) => !field.startsWith("__"),
        );
        const field = fields.find((item) => lower.includes(item.toLowerCase()));
        if (!field) {
          answer(
            `Which attribute should control “${layer.name}”? Available fields include: ${fields.slice(0, 20).join(", ") || "none currently loaded"}.`,
          );
          return;
        }
        const values = Array.from(
          new Set(layer.data.features.map((feature) => String(feature.properties?.[field] ?? ""))),
        ).slice(0, 100);
        const summary = `Colored “${layer.name}” by ${field}`;
        await mutate(text, summary, () =>
          wb.updateStyle(layer.id, {
            categorized: {
              enabled: true,
              field,
              rules: values.map((value, index) => ({
                value,
                label: value || "No value",
                color: colors[index % colors.length] ?? "#2f7d4f",
                visible: true,
              })),
              fallbackColor: layer.style.fillColor,
              fallbackVisible: true,
            },
          }),
        );
        answer(
          `${summary} using ${values.length} loaded value${values.length === 1 ? "" : "s"}. Adjust individual colors under Layer → Style.`,
        );
        return;
      }

      if (/\b(analy[sz]e|patterns?|insights?|distribution|statistics|stats)\b/.test(lower)) {
        answer(
          analyzeMap(
            wb.layers,
            findMentionedLayer(text, wb.layers, wb.activeLayer),
            wb.selectedFeatures,
          ),
        );
        return;
      }

      if (/\b(report|pdf|brief)\b/.test(lower)) {
        const reportLayer = findMentionedLayer(text, wb.layers, wb.activeLayer);
        const condition = reportLayer ? parseCondition(text, reportLayer) : null;
        const filtered =
          reportLayer && condition
            ? executeFilter(
                reportLayer,
                condition.field,
                condition.operator,
                condition.value,
                false,
              )
            : null;
        const count = await createReport(`Requested analysis: ${text}.`, filtered?.features);
        answer(
          `Created a PDF report with the current map, legend, and ${count.toLocaleString()} result feature${count === 1 ? "" : "s"}.`,
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
        answer(`Opened the public-data library${query ? ` and searched for “${query}”` : ""}.`);
        return;
      }

      if (/\b(open|show)\b.*\b(attribute )?table\b/.test(lower)) {
        setTableOpen(true);
        answer(
          wb.activeLayer
            ? `Opened the table for “${wb.activeLayer.name}”.`
            : "Opened the table. Select a layer to inspect it.",
        );
        return;
      }
      if (/\b(open|show)\b.*\b(spatial )?analysis\b/.test(lower)) {
        setAnalysisOpen(true);
        answer("Opened Spatial analysis. Results are created as Working layers.");
        return;
      }
      if (/\b(open|show|print)\b.*\b(print|layout|map preview)\b/.test(lower)) {
        setPrintOpen(true);
        answer("Opened Print map. Print annotations remain separate from the live project map.");
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
            ? `Found ${result.count.toLocaleString()} matches. Confirm the name and category in the New layer dialog.`
            : `Selected exactly ${result.count.toLocaleString()} matching feature${result.count === 1 ? "" : "s"} in “${layer.name}”.`,
        );
        return;
      }

      const help = helpAnswer(lower);
      answer(
        help ??
          (text.endsWith("?")
            ? "I don’t have a specific help article for that question yet. Try asking about adding or editing layers, selecting features, labels, styling, drawing, measurements, spatial analysis, public data, projects, printing, exporting, or account access."
            : contextualAnswer(wb.layers, wb.activeLayer, wb.projectName)),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "The request could not be completed";
      answer(`I couldn’t complete that request: ${errorMessage}`);
      toast.error("Assistant action could not finish", { description: errorMessage });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="app-overlay-viewport pointer-events-auto fixed inset-0 z-[90] flex"
      role="dialog"
      aria-modal="true"
    >
      <button
        className="flex-1 bg-foreground/20 backdrop-blur-[2px]"
        aria-label="Close AI"
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
            <p className="text-[10px] text-muted-foreground">Map actions, guidance and analysis</p>
          </div>
          <button
            onClick={() => setAssistantOpen(false)}
            aria-label="Close AI"
            className="ml-auto rounded-lg p-1.5 hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.map((item, index) => (
            <div
              key={item.id}
              ref={index === messages.length - 1 && !running ? latestMessageRef : undefined}
              className={
                item.role === "user"
                  ? "ml-10 rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-xs text-primary-foreground"
                  : "mr-6 whitespace-pre-line rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-xs leading-relaxed"
              }
            >
              {item.text}
            </div>
          ))}
          {running && (
            <div
              ref={latestMessageRef}
              className="mr-6 flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-xs text-muted-foreground"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Working on your request…
            </div>
          )}

          {actions.length > 0 && (
            <details className="rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-semibold">
                <History className="size-3.5" /> Undo recent AI changes ({actions.length})
              </summary>
              <div className="space-y-1 border-t border-border p-2">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-2 rounded-lg bg-secondary p-2 text-[10px]"
                  >
                    <span className="min-w-0 flex-1">{action.summary}</span>
                    <button
                      disabled={running}
                      onClick={() => void undoAction(action)}
                      className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 hover:border-primary disabled:opacity-40"
                    >
                      <Undo2 className="size-3" /> Revert
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="flex flex-wrap gap-1">
            {starters.map((starter) => (
              <button
                key={starter}
                disabled={running}
                onClick={() => void run(starter)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] hover:border-primary disabled:opacity-50"
              >
                {starter}
              </button>
            ))}
          </div>
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
              aria-label="Ask LandDraft AI"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" && !event.shiftKey && !running) {
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
              disabled={!prompt.trim() || running}
              aria-label="Send request"
              className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[9px] text-muted-foreground">
            Review assistant selections and public records before relying on them.
          </p>
        </form>
      </aside>
    </div>
  );
}

function findLayerByName(raw: string, layers: GisLayer[]) {
  const value = raw
    .trim()
    .replace(/^(the|layer)\s+/i, "")
    .toLowerCase();
  return (
    layers.find((layer) => layer.name.toLowerCase() === value) ??
    layers.find((layer) => layer.name.toLowerCase().includes(value))
  );
}

function findMentionedLayer(text: string, layers: GisLayer[], active: GisLayer | null) {
  const lower = text.toLowerCase();
  return (
    [...layers]
      .sort((a, b) => b.name.length - a.name.length)
      .find((layer) => lower.includes(layer.name.toLowerCase())) ??
    active ??
    layers[0] ??
    null
  );
}

function parseCondition(text: string, layer: GisLayer) {
  const fields = propertyKeys(layer.data.features as never).sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const field = fields.find((candidate) => lower.includes(candidate.toLowerCase()));
  if (!field) return null;
  const after = text.slice(lower.indexOf(field.toLowerCase()) + field.length);
  const match = after.match(
    /\s*(?:is\s*)?(>=|<=|>|<|=|equals?|contains?|starts\s+with)\s*["']?([^"']+?)["']?(?:\s+(?:and\s+)?(?:create|make|as|into)\b.*)?$/i,
  );
  if (!match) return null;
  const raw = match[1]?.toLowerCase() ?? "contains";
  const operator: Operator =
    raw === ">" || raw === ">="
      ? "greater"
      : raw === "<" || raw === "<="
        ? "less"
        : raw.startsWith("equal") || raw === "="
          ? "equals"
          : raw.startsWith("start")
            ? "starts"
            : "contains";
  return { field, operator, value: (match[2] ?? "").trim() };
}

function compare(raw: unknown, operator: Operator, expected: string) {
  const value = String(raw ?? "");
  if (operator === "greater" || operator === "less") {
    const left = Number(value.replaceAll(",", ""));
    const right = Number(expected.replaceAll(",", ""));
    return (
      Number.isFinite(left) &&
      Number.isFinite(right) &&
      (operator === "greater" ? left > right : left < right)
    );
  }
  const left = value.toLowerCase();
  const right = expected.toLowerCase();
  if (operator === "equals") return left === right;
  if (operator === "starts") return left.startsWith(right);
  return left.includes(right);
}

const operatorLabel = (operator: Operator) =>
  ({ contains: "contains", equals: "=", starts: "starts with", greater: ">", less: "<" })[operator];

function isGuidanceQuestion(prompt: string) {
  return (
    /\bhow\s+(?:do|can|would|should)\b/.test(prompt) ||
    /\bwhere\s+(?:do|can|is)\b/.test(prompt) ||
    /\bwhat\s+(?:is|are|does|can)\b/.test(prompt) ||
    /\b(?:help me|walk me through|explain)\b/.test(prompt) ||
    /\bcan you (?:tell|show|explain)(?: me)? how\b/.test(prompt)
  );
}

function analyzeMap(
  layers: GisLayer[],
  focused: GisLayer | null,
  selections: Array<{ layerId: string; index: number }>,
) {
  if (!layers.length)
    return "This project has no layers yet. Add public data, import a file, or draw features, then ask again.";
  const visible = layers.filter((layer) => layer.visible);
  const layer = (focused ?? visible[0] ?? layers[0])!;
  const total = layers.reduce((sum, item) => sum + item.data.features.length, 0);
  const geometry = new Map<string, number>();
  layer.data.features.forEach((feature) =>
    geometry.set(feature.geometry.type, (geometry.get(feature.geometry.type) ?? 0) + 1),
  );
  const insights: string[] = [];
  for (const field of propertyKeys(layer.data.features as never)
    .filter((item) => !item.startsWith("__"))
    .slice(0, 25)) {
    const values = layer.data.features
      .map((feature) => feature.properties?.[field])
      .filter((value) => value !== null && value !== undefined && value !== "");
    const numbers = values.map(Number).filter(Number.isFinite);
    if (numbers.length >= Math.max(3, values.length * 0.8)) {
      const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
      insights.push(
        `${field}: range ${Math.min(...numbers).toLocaleString()}–${Math.max(...numbers).toLocaleString()}, average ${mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      );
    } else if (values.length) {
      const counts = new Map<string, number>();
      values.forEach((value) => counts.set(String(value), (counts.get(String(value)) ?? 0) + 1));
      if (counts.size > 1) {
        const top = [...counts]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([value, count]) => `${value || "No value"} (${count})`)
          .join(", ");
        insights.push(`${field}: ${counts.size} distinct values; most common ${top}`);
      }
    }
    if (insights.length >= 4) break;
  }
  const selected = selections.filter((selection) => selection.layerId === layer.id).length;
  return [
    `Project overview: ${layers.length} layers, ${visible.length} visible, ${total.toLocaleString()} loaded features.`,
    `Focused layer “${layer.name}”: ${layer.data.features.length.toLocaleString()} features (${[...geometry].map(([type, count]) => `${count} ${type}`).join(", ") || "no loaded geometry"})${selected ? `; ${selected} selected` : ""}.`,
    ...(insights.length
      ? ["Attribute patterns:", ...insights.map((item) => `• ${item}`)]
      : ["No sufficiently populated attributes are loaded for a pattern summary."]),
    "These describe the currently loaded viewport and do not prove causation. Use Spatial analysis for buffers, intersections, clipping, dissolve, and proximity work.",
  ].join("\n");
}

function contextualAnswer(layers: GisLayer[], active: GisLayer | null, projectName: string) {
  const count = layers.reduce((sum, layer) => sum + layer.data.features.length, 0);
  return `I don’t yet recognize that as a direct action. “${projectName}” has ${layers.length} layers and ${count.toLocaleString()} loaded features${active ? `; “${active.name}” is active` : ""}. Name the layer and outcome—for example, “hide Roads,” “color Roads by TYPE,” “select Parcels where ACRES > 10,” or ask “how do I …?” Your request is saved in this project’s assistant history.`;
}

function helpAnswer(prompt: string): string | null {
  if (/\b(log ?out|sign ?out)\b/.test(prompt))
    return "Open the information (i) menu in the upper-right corner, then choose Log out under Account. On mobile, open the same i menu and tap Log out at the bottom.";
  if (/\b(add|create|make|load|import)\b.*\blayer\b/.test(prompt) && /\bedit/.test(prompt))
    return "Add a layer in any of three ways: open Public data and choose Add, drop a supported GIS file onto the Layers panel, or draw a point, line, or polygon and choose its destination. To edit it, make the layer active, select a feature, then edit its attributes in Table or use Edit vertices to move points and reshape lines or polygons. Click a faint midpoint to insert a new vertex.";
  if (/\b(add|create|make|load)\b.*\blayer\b/.test(prompt))
    return "To add a layer, use Public data for an official dataset, drop GeoJSON/KML/KMZ/zipped Shapefile/GPX/CSV onto the Layers panel, or draw a feature. After drawing or selecting features, the destination dialog lets you create a new layer, choose its category and name, or add the feature to an existing compatible layer.";
  if (/\b(edit|change|update)\b.*\b(feature|geometry|shape|attribute)\b/.test(prompt))
    return "Make the layer active and select the feature. Use Table to edit attribute values. Turn on Edit vertices to reshape geometry: drag a square vertex, click a faint midpoint to add one, or drag a point feature to move it. Save when finished; autosave can also preserve the project.";
  if (/\brename\b.*\blayer\b/.test(prompt))
    return "Double-click the layer name in the Layers panel, type the new name, and confirm. Or tell me: “Rename Roads to Access routes.”";
  if (/\b(import|kml|kmz|shp|shapefile|csv|gpx)\b/.test(prompt))
    return "Drop GeoJSON, KML, KMZ, zipped Shapefile, GPX, or CSV files onto the Layers panel. They are added to Imported files.";
  if (/\b(label|labels|attribute label)\b/.test(prompt))
    return "Expand a layer, open Style, choose one or more label fields, and turn labels on. Advanced labeling controls separators and zoom visibility.";
  if (/\b(color|colour|symbolog|categor)\b/.test(prompt))
    return "Expand a layer, open Style, then choose Color features by attribute. Pick a field and set each distinct value’s color or visibility.";
  if (/\b(group|subgroup|folder|sublayer|feature list)\b/.test(prompt))
    return "Use folder-plus for groups and subgroups. Expand a layer, then Advanced layer options → Features as sublayers to search, select, zoom, rename, hide, or remove features.";
  if (/\b(vertex|vertices|reshape|edit geometry)\b/.test(prompt))
    return "Select one feature, turn on Edit vertices, then drag a square vertex. Click a faint midpoint to add a vertex. Points can be dragged; lines and polygons reshaped.";
  if (/\b(multiple|multi-select|box select|select many)\b/.test(prompt))
    return "Use Multi-select to click features one at a time, or Box select to drag across an area. The active layer is preferred where features overlap.";
  if (/\b(snap|snapping|draw)\b/.test(prompt))
    return "Turn on Snap, then draw a point, line, or area. New vertices snap to nearby visible features; GPS point uses device location with permission.";
  if (/\b(gps|location|track|field work|walking distance|driving path)\b/.test(prompt))
    return "On the mobile site, switch to Field at the top. Tap Locate for your live position, Mark for a named GPS point, or Track path / Track area while walking or driving. Field captures save into this project and appear in the full map. Turn on Parcels for owner labels, then tap a feature for attributes or directions.";
  if (/\b(export|kmz|pdf|shp|print)\b/.test(prompt))
    return "Open Export for PDF, GeoJSON, KML, KMZ, or Shapefile. Print map opens the layout editor; reports include the map, legend, and selected attributes.";
  if (/\b(parcel|ownership|tax)\b/.test(prompt))
    return "Open Public data, choose project states, search parcel, and use a county filter where supported. Parcel data streams for the visible area at close zoom.";
  if (/\b(spatial|buffer|intersect|clip|dissolve|proximity)\b/.test(prompt))
    return "Open Spatial analysis, choose an operation and inputs, and LandDraft creates a new Working layer without altering originals.";
  if (/\b(project|subproject|autosave|history)\b/.test(prompt))
    return "Use the project name in the top bar to switch, duplicate, create a project or subproject, manage overlays, toggle autosave, and restore history.";
  if (/\b(layer order|reorder|move layer|on top|behind)\b/.test(prompt))
    return "Drag a layer by its handle in the Layers panel. Layers higher in the list draw above layers below them. You can also move or duplicate a layer into Working layers or another group before sorting it.";
  if (/\b(measure|area|acre|distance|length)\b/.test(prompt))
    return "Choose the area or distance measurement tool in the drawing toolbar, click points on the map, then double-click or press Enter to finish. Use the unit selectors to switch among acres, square feet, hectares, miles, feet, meters, or kilometers.";
  if (/\b(broken|failed|repair|reconnect|api|connection)\b/.test(prompt))
    return "Open the Info menu → API connections. LandDraft checks live sources when a project opens and safely applies verified replacements before reporting a break. Expand any source to open it, edit its URL, find a replacement, or select Test & use.";
  if (/\b(basemap|satellite|street map|dark map|topo)\b/.test(prompt))
    return "Open the basemap selector at the lower-right of the map and choose Street, Satellite, Topo, Dark, or OSM. The zoom level appears directly beneath the selector.";
  return null;
}
