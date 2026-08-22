export interface PlaceResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number] | undefined;
  type: string;
}

/** Free, keyless geocoding via OpenStreetMap Nominatim. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const coord = parseCoordinate(q);
  if (coord) {
    return [
      {
        id: "coord",
        label: `Coordinates ${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`,
        lat: coord.lat,
        lng: coord.lng,
        type: "coordinate",
      },
    ];
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal: signal ?? null, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Search is unavailable right now");
  const rows = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    type: string;
    boundingbox?: [string, string, string, string];
  }>;
  return rows.map((r) => ({
    id: String(r.place_id),
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    type: r.type,
    bbox: r.boundingbox
      ? ([
          Number(r.boundingbox[2]),
          Number(r.boundingbox[0]),
          Number(r.boundingbox[3]),
          Number(r.boundingbox[1]),
        ] as [number, number, number, number])
      : undefined,
  }));
}

export function parseCoordinate(input: string): { lat: number; lng: number } | null {
  const m = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a };
  return null;
}
