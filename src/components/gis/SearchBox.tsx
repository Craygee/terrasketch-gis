import { useEffect, useRef, useState } from "react";
import { Search, Loader2, LocateFixed, X } from "lucide-react";
import { toast } from "sonner";
import { searchPlaces, type PlaceResult } from "@/lib/gis/geocode";
import { useMapRef } from "@/lib/gis/mapRef";

export function SearchBox() {
  const { map } = useMapRef();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      searchPlaces(query, controller.signal)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch((err: unknown) => {
          if ((err as Error)?.name !== "AbortError") setResults([]);
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const goTo = (place: PlaceResult) => {
    if (!map) return;
    if (place.bbox) map.fitBounds(place.bbox, { padding: 80, maxZoom: 16 });
    else map.flyTo({ center: [place.lng, place.lat], zoom: 14 });
    setOpen(false);
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error("This browser can't share your location");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(false);
        map?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 });
        toast.success("Jumped to your current place");
      },
      () => {
        setLoading(false);
        toast.error("Location permission was declined");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="w-full sm:w-[22rem]">
      <div className="float-surface flex items-center gap-2 rounded-2xl px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search a place, address or lat, lon"
          aria-label="Search places"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading && <Loader2 className="size-4 animate-spin text-primary" />}
        {query && !loading && (
          <button onClick={() => setQuery("")} aria-label="Clear search" title="Clear search">
            <X className="size-4 text-muted-foreground" />
          </button>
        )}
        <button
          onClick={locateMe}
          title="Go to my current place"
          aria-label="Go to my current place"
          className="rounded-lg p-1 text-primary hover:bg-accent"
        >
          <LocateFixed className="size-4" />
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="float-surface mt-2 max-h-72 overflow-auto rounded-2xl p-1">
          {results.map((r) => (
            <button
              key={r.id + r.label}
              onClick={() => goTo(r)}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <div className="line-clamp-2">{r.label}</div>
              <div className="text-[11px] text-muted-foreground">{r.type}</div>
            </button>
          ))}
          <div className="px-3 py-1 text-[10px] text-muted-foreground">
            Place search by OpenStreetMap Nominatim
          </div>
        </div>
      )}
    </div>
  );
}
