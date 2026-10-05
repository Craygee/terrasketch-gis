import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Building2, Crosshair, FileUp, ImagePlus, Layers3, Mountain, X } from "lucide-react";
import { toast } from "sonner";

import { importFiles, SUPPORTED_EXTENSIONS } from "@/lib/gis/import";
import { useMapRef } from "@/lib/gis/mapRef";
import {
  createSiteObjectFeature,
  imageOverlayCoordinates,
  imageOverlayFootprint,
  SITE_OBJECTS,
  siteObjectDefinition,
  type SiteObjectPlacementRequest,
} from "@/lib/gis/siteDesigner";
import { useWorkbench } from "@/lib/gis/store";
import { cn } from "@/lib/utils";

const imageDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

export function SiteDesignerPanel() {
  const wb = useWorkbench();
  const { map, siteDesignerOpen, setSiteDesignerOpen, pendingSiteObject, setPendingSiteObject } =
    useMapRef();
  const [definitionId, setDefinitionId] = useState("building");
  const definition = useMemo(() => siteObjectDefinition(definitionId), [definitionId]);
  const [name, setName] = useState(definition.name);
  const [scenario, setScenario] = useState("Proposed");
  const [widthFt, setWidthFt] = useState(definition.defaultWidthFt);
  const [lengthFt, setLengthFt] = useState(definition.defaultLengthFt);
  const [heightFt, setHeightFt] = useState(definition.defaultHeightFt ?? 0);
  const [depthFt, setDepthFt] = useState(definition.defaultDepthFt ?? 0);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageWidthFt, setImageWidthFt] = useState(500);
  const [imageHeightFt, setImageHeightFt] = useState(300);
  const [imageRotationDeg, setImageRotationDeg] = useState(0);
  const [busy, setBusy] = useState(false);
  const designFileInput = useRef<HTMLInputElement>(null);
  const imageFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(definition.name);
    setWidthFt(definition.defaultWidthFt);
    setLengthFt(definition.defaultLengthFt);
    setHeightFt(definition.defaultHeightFt ?? 0);
    setDepthFt(definition.defaultDepthFt ?? 0);
    setRotationDeg(0);
  }, [definition]);

  if (!siteDesignerOpen) return null;

  const request = (): SiteObjectPlacementRequest => ({
    definitionId,
    name: name.trim() || definition.name,
    scenario,
    widthFt,
    lengthFt,
    heightFt,
    depthFt,
    rotationDeg,
  });

  const addPlacement = (placementRequest: SiteObjectPlacementRequest, center: [number, number]) => {
    const placement = createSiteObjectFeature(placementRequest, center);
    const existingLayer = wb.layers.find(
      (layer) =>
        layer.groupId === "design" &&
        layer.source.kind === "draw" &&
        layer.source.purpose === "site-design" &&
        layer.source.siteObjectKind === placement.definition.id,
    );
    if (existingLayer) {
      wb.appendFeature(existingLayer.id, placement.feature as never);
      wb.setActiveLayer(existingLayer.id);
    } else {
      wb.addLayer({
        name: placement.layerName,
        groupId: "design",
        source: {
          kind: "draw",
          purpose: "site-design",
          siteObjectKind: placement.definition.id,
        },
        style: placement.style,
        data: { type: "FeatureCollection", features: [placement.feature as never] },
      });
    }
    toast.success(`${placement.definition.name} added to Design overlays`);
  };

  const placeAtCenter = () => {
    if (!map) {
      toast.error("Map is not ready yet");
      return;
    }
    const center = map.getCenter();
    addPlacement(request(), [center.lng, center.lat]);
  };

  const placeOnMap = () => {
    setPendingSiteObject(request());
    wb.setDrawMode("none");
    setSiteDesignerOpen(false);
  };

  const addImageOverlay = async () => {
    if (!map || !imageFile) return;
    if (imageFile.size > 5 * 1024 * 1024) {
      toast.error("Design images must be 5 MB or smaller");
      return;
    }
    setBusy(true);
    try {
      const center = map.getCenter();
      const coordinates = imageOverlayCoordinates(
        [center.lng, center.lat],
        imageWidthFt,
        imageHeightFt,
        imageRotationDeg,
      );
      const overlayName = baseName(imageFile.name) || "Design image";
      wb.addLayer({
        name: overlayName,
        groupId: "design",
        source: {
          kind: "image",
          fileName: imageFile.name,
          dataUrl: await imageDataUrl(imageFile),
          coordinates,
          designSource: "canva",
        },
        style: { fillOpacity: 0.78 },
        data: {
          type: "FeatureCollection",
          features: [imageOverlayFootprint(coordinates, overlayName)],
        },
      });
      setImageFile(null);
      if (imageFileInput.current) imageFileInput.current.value = "";
      toast.success("Design image added at the map center", {
        description: "Use the layer opacity control to compare it with the basemap.",
      });
    } catch (error) {
      toast.error("Design image could not be added", {
        description: error instanceof Error ? error.message : "The image could not be read",
      });
    } finally {
      setBusy(false);
    }
  };

  const importDesignFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const { results, errors } = await importFiles(files);
      for (const result of results) {
        wb.addLayer({
          name: result.name,
          data: result.data,
          groupId: "design",
          source: { kind: "import", fileName: result.name, designSource: "gis" },
          style: { fillOpacity: 0.34, strokeWidth: 2.2 },
        });
      }
      errors.forEach((message) => toast.error(message));
      if (results.length)
        toast.success(`${results.length} design file${results.length === 1 ? "" : "s"} imported`, {
          description: "Saved as editable layers in Design overlays.",
        });
    } finally {
      setBusy(false);
      if (designFileInput.current) designFileInput.current.value = "";
    }
  };

  const categories = [...new Set(SITE_OBJECTS.map((item) => item.category))];

  return (
    <div className="app-overlay-viewport fixed inset-0 z-[105] flex items-center justify-center overflow-y-auto bg-foreground/25 p-2 backdrop-blur-[2px] sm:p-4">
      <section
        className="panel-surface max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-3xl p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Site Designer"
      >
        <header className="flex items-start gap-3 border-b border-border pb-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Site Designer</h2>
            <p className="text-xs text-muted-foreground">
              Place editable site objects or align a Canva, image, SketchUp footprint, or GIS design
              with the map.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSiteDesignerOpen(false)}
            className="rounded-xl p-2 hover:bg-accent"
            aria-label="Close Site Designer"
          >
            <X className="size-4" />
          </button>
        </header>

        {pendingSiteObject && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2 text-xs">
            <span>Waiting to place {pendingSiteObject.name} on the map.</span>
            <button
              className="font-semibold text-primary"
              onClick={() => setPendingSiteObject(null)}
            >
              Cancel placement
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-2xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Layers3 className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Site-object library</h3>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Objects are saved by type in Design overlays and remain editable through the existing
              layer, attribute, and vertex tools.
            </p>
            <div className="mt-3 space-y-3">
              {categories.map((category) => (
                <div key={category}>
                  <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {category}
                  </div>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {SITE_OBJECTS.filter((item) => item.category === category).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setDefinitionId(item.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs",
                          definitionId === item.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        <span className="text-xl" style={{ color: item.color }}>
                          {item.icon}
                        </span>
                        <span className="font-semibold">{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl" style={{ color: definition.color }}>
                {definition.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold">Place {definition.name}</h3>
                <p className="text-[9px] text-muted-foreground">LandDraft design object</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Name" value={name} onChange={setName} text />
              <label className="text-[10px] font-semibold">
                Scenario
                <select
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
                >
                  <option>Existing</option>
                  <option>Proposed</option>
                  <option>Option A</option>
                  <option>Option B</option>
                  <option>Future</option>
                </select>
              </label>
              <Field label="Width (ft)" value={widthFt} onChange={setWidthFt} />
              <Field label="Length (ft)" value={lengthFt} onChange={setLengthFt} />
              <Field label="Height (ft)" value={heightFt} onChange={setHeightFt} />
              <Field label="Depth (ft)" value={depthFt} onChange={setDepthFt} />
              <Field label="Rotation (degrees)" value={rotationDeg} onChange={setRotationDeg} />
            </div>
            {definition.id === "pond" && depthFt > 0 && (
              <p className="mt-2 rounded-lg bg-card px-2 py-1.5 text-[9px] text-muted-foreground">
                The initial pond record includes an estimated footprint × depth volume. Refine the
                geometry and surveyed grades before engineering use.
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={placeOnMap}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                <Crosshair className="size-3.5" /> Place on map
              </button>
              <button
                type="button"
                onClick={placeAtCenter}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-semibold hover:bg-accent"
              >
                <Box className="size-3.5" /> Add at center
              </button>
            </div>
            <button
              type="button"
              onClick={() => map?.easeTo({ pitch: map.getPitch() > 20 ? 0 : 55, duration: 500 })}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-semibold hover:bg-accent"
            >
              <Mountain className="size-3.5 text-primary" /> Toggle 3D height view
            </button>
          </section>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-border p-3">
            <div className="flex items-center gap-2">
              <ImagePlus className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Canva or image overlay</h3>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Export a transparent PNG, JPG, WebP, or SVG. LandDraft places it at the current map
              center using the real-world dimensions below.
            </p>
            <input
              ref={imageFileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold"
            />
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Field label="Width (ft)" value={imageWidthFt} onChange={setImageWidthFt} />
              <Field label="Height (ft)" value={imageHeightFt} onChange={setImageHeightFt} />
              <Field label="Rotation°" value={imageRotationDeg} onChange={setImageRotationDeg} />
            </div>
            <button
              type="button"
              onClick={() => void addImageOverlay()}
              disabled={!imageFile || busy}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              <ImagePlus className="size-3.5" /> Add image overlay
            </button>
          </section>

          <section className="rounded-2xl border border-border p-3">
            <div className="flex items-center gap-2">
              <FileUp className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">SketchUp or GIS design import</h3>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Import a SketchUp footprint exported as KML/KMZ or any GeoJSON, zipped shapefile, GPX,
              or coordinate CSV. Polygons with a HEIGHT_FT attribute render in the 3D height view.
            </p>
            <input
              ref={designFileInput}
              type="file"
              multiple
              accept={SUPPORTED_EXTENSIONS.join(",")}
              onChange={(event) => void importDesignFiles(Array.from(event.target.files ?? []))}
              className="mt-3 block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold"
            />
            <div className="mt-3 rounded-xl bg-secondary/60 p-2 text-[9px] leading-relaxed text-muted-foreground">
              Full textured GLB/DAE model rendering is not included in this first release. Keep the
              original model attached to the project record and use its georeferenced footprint for
              map editing and analysis.
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  text,
}: {
  label: string;
  value: string | number;
  onChange: (value: never) => void;
  text?: boolean;
}) {
  return (
    <label className="text-[10px] font-semibold">
      {label}
      <input
        type={text ? "text" : "number"}
        value={value}
        step={text ? undefined : "any"}
        min={text ? undefined : 0}
        onChange={(event) =>
          onChange((text ? event.target.value : Number(event.target.value)) as never)
        }
        className="mt-1 w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
      />
    </label>
  );
}
