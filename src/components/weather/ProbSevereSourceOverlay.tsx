import { useEffect } from "react";
import { Popup, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import { useMapRef } from "@/lib/gis/mapRef";
import type { WeatherBundle } from "@/lib/weather/types";

const sourceId = "noaa-probsevere-source";
import { probSevereSourceLayerIds } from "@/lib/weather/probSevereSource";

export function ProbSevereSourceOverlay({
  data,
  visible,
  opacity,
}: {
  data: WeatherBundle["probSevereSource"];
  visible: boolean;
  opacity: number;
}) {
  const { map } = useMapRef();
  useEffect(() => {
    if (!map) return;
    const popup = new Popup({ closeButton: true, maxWidth: "320px" });
    const update = () => {
      if (!map.getStyle()) return;
      if (!visible || !data) {
        for (const id of probSevereSourceLayerIds) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        popup.remove();
        return;
      }
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: data.data,
          attribution: "NOAA / CIMSS ProbSevere v3 · source guidance",
        });
        map.addLayer({
          id: probSevereSourceLayerIds[0]!,
          type: "fill",
          source: sourceId,
          paint: { "fill-color": "#7c3aed", "fill-opacity": opacity },
        });
        map.addLayer({
          id: probSevereSourceLayerIds[1]!,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#6d28d9",
            "line-width": 2,
            "line-opacity": Math.min(1, opacity * 3),
          },
        });
      } else {
        (map.getSource(sourceId) as GeoJSONSource).setData(data.data);
        map.setPaintProperty(probSevereSourceLayerIds[0]!, "fill-opacity", opacity);
        map.setPaintProperty(
          probSevereSourceLayerIds[1]!,
          "line-opacity",
          Math.min(1, opacity * 3),
        );
      }
      const before = map.getLayer("landdraft-weather-alert-fill")
        ? "landdraft-weather-alert-fill"
        : undefined;
      for (const id of probSevereSourceLayerIds) map.moveLayer(id, before);
    };
    const inspect = (event: MapMouseEvent) => {
      if (!visible || !data || !map.getLayer(probSevereSourceLayerIds[0]!)) return;
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [probSevereSourceLayerIds[0]!],
      })[0];
      if (!feature) return;
      const element = document.createElement("div");
      element.className = "space-y-2 text-xs";
      const title = document.createElement("strong");
      title.textContent = "NOAA ProbSevere · source attributes";
      const caption = document.createElement("p");
      caption.textContent = `${new Date(data.timestamp).toLocaleString()} · NOAA guidance, not an official warning. No LandDraft projections applied.`;
      const attributes = document.createElement("pre");
      attributes.className = "max-h-56 overflow-auto whitespace-pre-wrap text-[10px]";
      attributes.textContent = JSON.stringify(feature.properties, null, 2);
      element.append(title, caption, attributes);
      popup.setLngLat(event.lngLat).setDOMContent(element).addTo(map);
    };
    update();
    map.on("style.load", update);
    map.on("click", inspect);
    return () => {
      map.off("style.load", update);
      map.off("click", inspect);
      popup.remove();
    };
  }, [map, data, visible, opacity]);
  useEffect(
    () => () => {
      if (!map) return;
      for (const id of probSevereSourceLayerIds) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    },
    [map],
  );
  return null;
}
