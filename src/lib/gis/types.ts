import type { Feature, FeatureCollection, Geometry } from "geojson";

export type FillPattern =
  "solid" | "diagonal" | "horizontal" | "vertical" | "crosshatch" | "dotted";
export type StrokePattern = "solid" | "dashed" | "dotted";

export interface LayerStyle {
  fillColor: string;
  fillOpacity: number;
  fillPattern: FillPattern;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokePattern: StrokePattern;
  pointSize: number;
  labelTemplate: string;
  labelFields: string[];
  labelSeparator: string;
  labelEnabled: boolean;
  labelMinZoom: number;
  labelMaxZoom: number;
}

export interface AreaUnitsPref {
  area: "acres" | "sqft" | "sqm" | "hectares";
  length: "miles" | "feet" | "meters" | "kilometers";
}

export type LayerSource =
  | { kind: "import"; fileName: string }
  | { kind: "draw" }
  | { kind: "derived"; sourceLayerId: string; query?: string }
  | {
      kind: "remote";
      url: string;
      catalogId?: string;
      attribution?: string;
      where?: string;
      outFields?: string[];
      requiresViewport?: boolean;
      minZoom?: number;
      refreshMinutes?: number;
      lastRefreshedAt?: number;
      loading?: boolean;
    };

export interface GisLayer {
  id: string;
  name: string;
  groupId: string;
  visible: boolean;
  data: FeatureCollection;
  style: LayerStyle;
  source: LayerSource;
  createdAt: number;
}

export interface LayerGroup {
  id: string;
  name: string;
  collapsed: boolean;
  parentId?: string | null;
}

export interface ProjectState {
  version: 1;
  name: string;
  groups: LayerGroup[];
  layers: GisLayer[];
  basemapId: string;
  units: AreaUnitsPref;
  selectedStates?: string[];
  derivedLayerGroupId?: string;
  savedAt?: number;
}

export type GisFeature = Feature<Geometry, Record<string, unknown>>;

export const defaultStyle = (seed = 0): LayerStyle => {
  const palette = ["#2f7d4f", "#c9832c", "#3b6ea5", "#8e4a86", "#b0453a", "#3f7f7a"];
  const color = palette[seed % palette.length] ?? "#2f7d4f";
  return {
    fillColor: color,
    fillOpacity: 0.35,
    fillPattern: "solid",
    strokeColor: color,
    strokeWidth: 2,
    strokeOpacity: 1,
    strokePattern: "solid",
    pointSize: 6,
    labelTemplate: "",
    labelFields: [],
    labelSeparator: " · ",
    labelEnabled: false,
    labelMinZoom: 4,
    labelMaxZoom: 24,
  };
};
