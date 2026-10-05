import type { LayerGroup } from "./types.ts";

export const CORE_LAYER_GROUPS: readonly LayerGroup[] = [
  { id: "working", name: "Working layers", collapsed: false },
  { id: "sketch", name: "My sketches", collapsed: false },
  { id: "imports", name: "Imported files", collapsed: false },
  { id: "public", name: "Public data", collapsed: false },
];

export const createCoreLayerGroups = (): LayerGroup[] =>
  CORE_LAYER_GROUPS.map((group) => ({ ...group }));

/**
 * Restores built-in root groups that are absent from older saved projects without moving the
 * user's existing groups. Missing groups are inserted beside the nearest built-in predecessor so
 * imported and public layers cannot become orphaned from the desktop layer tree.
 */
export const ensureCoreLayerGroups = (groups: LayerGroup[]): LayerGroup[] => {
  const normalized = groups.map((group) => ({ ...group }));
  for (let coreIndex = 0; coreIndex < CORE_LAYER_GROUPS.length; coreIndex += 1) {
    const core = CORE_LAYER_GROUPS[coreIndex];
    if (!core || normalized.some((group) => group.id === core.id)) continue;

    let insertAt = normalized.length;
    for (let preceding = coreIndex - 1; preceding >= 0; preceding -= 1) {
      const precedingCore = CORE_LAYER_GROUPS[preceding];
      const precedingIndex = precedingCore
        ? normalized.findIndex((group) => group.id === precedingCore.id)
        : -1;
      if (precedingIndex >= 0) {
        insertAt = precedingIndex + 1;
        break;
      }
    }
    normalized.splice(insertAt, 0, { ...core });
  }
  return normalized;
};
