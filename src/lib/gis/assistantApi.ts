import type { Feature, FeatureCollection } from "geojson";

import { cloudFunctionRequest } from "@/lib/cloud";
import { propertyKeys } from "./labels";
import type { AssistantMessage, GisLayer, MapViewState } from "./types";

export type RemoteAssistantActionType =
  | "add_place_layer"
  | "open_panel"
  | "rename_layer"
  | "select_features"
  | "set_labels"
  | "set_layer_visibility"
  | "style_by_attribute"
  | "zoom_to_layer";

export interface RemoteAssistantAction {
  type: RemoteAssistantActionType;
  layerName?: string;
  targetName?: string;
  field?: string;
  operator?: "contains" | "equals" | "starts" | "greater" | "less";
  value?: string;
  createLayer?: boolean;
  visible?: boolean;
  labelFields?: string[];
  panel?: "public_data" | "table" | "analysis" | "print" | "records";
  suggestedLayerName?: string;
  query?: string;
  features?: Feature[];
}

export interface RemoteAssistantResponse {
  answer: string;
  actions: RemoteAssistantAction[];
  sources: Array<{ title: string; url: string }>;
  provider?: "groq" | "openai";
  quota?: {
    allowed: boolean;
    userRequestsRemaining: number;
    globalRequestsRemaining: number;
    userTokensRemaining: number;
    globalTokensRemaining: number;
  };
}

interface AssistantContextInput {
  projectName: string;
  mapView: MapViewState;
  selectedStates: string[];
  layers: GisLayer[];
  activeLayer: GisLayer | null;
  selectedFeatures: Array<{ layerId: string; index: number }>;
}

const safeValue = (value: unknown): string | number | boolean | null => {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return String(value).slice(0, 180);
};

const featureProperties = (feature: Feature | undefined) => {
  if (!feature?.properties) return {};
  return Object.fromEntries(
    Object.entries(feature.properties)
      .filter(([key]) => !key.startsWith("__"))
      .slice(0, 20)
      .map(([key, value]) => [key, safeValue(value)]),
  );
};

const layerContext = (layer: GisLayer) => {
  const fields = propertyKeys(layer.data.features as never)
    .filter((field) => !field.startsWith("__"))
    .slice(0, 40);
  const geometryCounts: Record<string, number> = {};
  for (const feature of layer.data.features) {
    geometryCounts[feature.geometry.type] = (geometryCounts[feature.geometry.type] ?? 0) + 1;
  }
  const sampleValues = Object.fromEntries(
    fields.slice(0, 12).map((field) => [
      field,
      Array.from(
        new Set(
          layer.data.features
            .slice(0, 100)
            .map((feature) => safeValue(feature.properties?.[field]))
            .filter((value) => value !== null && value !== ""),
        ),
      ).slice(0, 5),
    ]),
  );
  return {
    id: layer.id,
    name: layer.name,
    groupId: layer.groupId,
    visible: layer.visible,
    sourceKind: layer.source.kind,
    featureCount: layer.data.features.length,
    geometryCounts,
    fields,
    sampleValues,
    labels: {
      enabled: layer.style.labelEnabled,
      fields: layer.style.labelFields,
      template: layer.style.labelTemplate,
    },
  };
};

export function buildAssistantContext(input: AssistantContextInput) {
  return {
    product: "LandDraft",
    project: {
      name: input.projectName,
      mapView: input.mapView,
      selectedStates: input.selectedStates,
      activeLayerName: input.activeLayer?.name ?? null,
      layerCount: input.layers.length,
      loadedFeatureCount: input.layers.reduce(
        (total, layer) => total + layer.data.features.length,
        0,
      ),
    },
    layers: Array.from(
      new Map(
        [input.activeLayer, ...input.layers]
          .filter((layer): layer is GisLayer => Boolean(layer))
          .map((layer) => [layer.id, layer]),
      ).values(),
    )
      .slice(0, 40)
      .map(layerContext),
    selection: input.selectedFeatures.slice(0, 50).flatMap((selection) => {
      const layer = input.layers.find((item) => item.id === selection.layerId);
      const feature = layer?.data.features[selection.index];
      return layer && feature
        ? [
            {
              layerName: layer.name,
              featureIndex: selection.index,
              geometryType: feature.geometry.type,
              properties: featureProperties(feature),
            },
          ]
        : [];
    }),
  };
}

export async function askLandDraftAssistant(input: {
  prompt: string;
  messages: AssistantMessage[];
  context: ReturnType<typeof buildAssistantContext>;
}): Promise<RemoteAssistantResponse> {
  const recentMessages = input.messages
    .filter(
      (message, index, all) =>
        !(
          index === all.length - 1 &&
          message.role === "user" &&
          message.text.trim() === input.prompt.trim()
        ),
    )
    .slice(-8)
    .map(({ role, text }) => ({ role, text: text.slice(0, 900) }));
  return cloudFunctionRequest<RemoteAssistantResponse>("gis-assistant", {
    prompt: input.prompt.slice(0, 4_000),
    messages: recentMessages,
    context: input.context,
  });
}

export const assistantFeatureCollection = (features: Feature[] | undefined): FeatureCollection => ({
  type: "FeatureCollection",
  features: features ?? [],
});
