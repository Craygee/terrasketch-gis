import { NativeRadarControls } from "./NativeRadarControls";
import { landdraftOverlayIds } from "@/lib/weather/landdraftLayers";
import { weatherLayerRegistry } from "@/lib/weather/registry";
import { layerAvailability } from "@/lib/weather/layerAvailability";
import type { NativeRadarReading } from "@/lib/weather/nativeRadar";
import type {
  WeatherBundle,
  WeatherWorkspaceState,
  WeatherLayerSetting,
} from "@/lib/weather/types";

export function LandDraftMapControls({
  workspace,
  bundle,
  readings,
  onWorkspace,
  onLayer,
}: {
  workspace: WeatherWorkspaceState;
  bundle: WeatherBundle | null;
  readings: Record<string, NativeRadarReading>;
  onWorkspace(value: WeatherWorkspaceState): void;
  onLayer(id: string, change: Partial<WeatherLayerSetting>): void;
}) {
  return (
    <div className="space-y-3 p-3">
      <NativeRadarControls
        workspace={workspace}
        bundle={bundle}
        readings={readings}
        onWorkspace={onWorkspace}
        onLayer={onLayer}
      />
      <details className="rounded-2xl border border-border bg-background">
        <summary className="cursor-pointer p-3 text-xs font-semibold">
          LandDraft rainfall & overlays
        </summary>
        <div className="space-y-2 border-t p-3">
          {landdraftOverlayIds.map((id) => {
            const layer = weatherLayerRegistry.find((layer) => layer.id === id);
            if (!layer) return null;
            const setting = workspace.layerSettings[id],
              availability = layerAvailability(id, bundle, { connected: false });
            return (
              <div key={id} className="rounded-lg bg-secondary p-2 text-xs">
                <label className="flex gap-2">
                  <input
                    aria-label={layer.name}
                    type="checkbox"
                    checked={!!setting?.visible}
                    onChange={(event) => onLayer(id, { visible: event.target.checked })}
                  />
                  {layer.name}
                </label>
                <p className="mt-1 text-[10px] text-muted-foreground">{availability.label}</p>
                {setting?.visible && (
                  <input
                    aria-label={`${layer.name} opacity`}
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={setting.opacity}
                    onChange={(event) => onLayer(id, { opacity: Number(event.target.value) })}
                    className="mt-2 w-full"
                  />
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
