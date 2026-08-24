export type TourKind = "basic" | "advanced" | "print";

export interface TourStep {
  id: string;
  target: string;
  title: string;
  body: string;
}

/**
 * Add tour-worthy features here and increment TOUR_VERSION. Users who keep
 * feature tips enabled will be offered the refreshed walkthrough once.
 */
export const TOUR_VERSION = 2;

export const TOUR_REGISTRY: Record<TourKind, TourStep[]> = {
  basic: [
    {
      id: "layers",
      target: "layer-panel",
      title: "Your map layers",
      body: "Import files, group layers, change their order, visibility and style from this panel.",
    },
    {
      id: "public-data",
      target: "top-public-data",
      title: "Add public data",
      body: "Search official data sources and add only the layers and attributes you need.",
    },
    {
      id: "draw",
      target: "draw-toolbar",
      title: "Draw, select and measure",
      body: "Create points, lines and areas, select one or many features, measure, snap and capture GPS points.",
    },
    {
      id: "ai",
      target: "top-ai",
      title: "You can ask the AI",
      body: "Ask LandDraft AI to find data, query attributes, select features, explain tools or prepare a report.",
    },
    {
      id: "analysis",
      target: "top-analysis",
      title: "Spatial analysis",
      body: "Create buffers, centroids, merged areas, intersections, differences and convex hulls without a complicated toolbar.",
    },
    {
      id: "print",
      target: "top-print",
      title: "Compose a print-ready map",
      body: "Open a separate print workspace for titles, legends, callouts, markers and PDF output. Your project map is unchanged.",
    },
  ],
  advanced: [
    {
      id: "search",
      target: "map-search",
      title: "Search and position",
      body: "Find an address, place or coordinate and jump the map to it. Use the location control for your device position.",
    },
    {
      id: "layer-organization",
      target: "layer-panel",
      title: "Groups, subgroups and styling",
      body: "Drag layers to control drawing order, nest groups, apply a shared group style, label from attributes and keep advanced options collapsed until needed.",
    },
    {
      id: "attributes",
      target: "top-table",
      title: "Work with attributes",
      body: "Search or edit table fields. Map selections and table selections stay connected so selected records can become a new layer.",
    },
    {
      id: "analysis-detail",
      target: "top-analysis",
      title: "Analysis uses your selection",
      body: "Run tools on a whole layer or only its selected features, then choose a new or existing destination layer.",
    },
    {
      id: "projects",
      target: "top-projects",
      title: "Projects and subprojects",
      body: "Switch maps, duplicate projects, create subprojects and overlay selected subprojects in a parent map.",
    },
    {
      id: "basemap",
      target: "basemap-control",
      title: "Basemaps and zoom",
      body: "Change the background map here. The current zoom level stays visible directly below the basemap selector.",
    },
    {
      id: "export",
      target: "top-export",
      title: "Export your work",
      body: "Export GIS data in GeoJSON, KML, KMZ and Shapefile formats, or use Print map for PDF output.",
    },
  ],
  print: [
    {
      id: "print-page",
      target: "print-page",
      title: "A separate print composition",
      body: "Pan and zoom this map frame without changing the live project. Saved print additions return in the same composition.",
    },
    {
      id: "print-settings",
      target: "print-settings",
      title: "Keep the page simple",
      body: "Choose paper, titles and map furniture here. Layer and advanced layout controls stay collapsed until you need them.",
    },
    {
      id: "print-tools",
      target: "print-tools",
      title: "Annotate the page",
      body: "Add text, drag-to-place lines and arrows, smart callouts, markers, or decimal and DMS GPS labels.",
    },
    {
      id: "print-reset",
      target: "print-reset",
      title: "Reset the map frame",
      body: "Restore the recommended map size and position for the selected page. Clearing all additions also restores this frame.",
    },
    {
      id: "print-output",
      target: "print-output",
      title: "Print or save a PDF",
      body: "When the page is ready, use this button and choose your browser's PDF destination or a connected printer.",
    },
  ],
};
