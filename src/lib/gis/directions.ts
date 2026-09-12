export type NavigationActivity = "walking" | "driving";
export type NavigationDirection = "to" | "from";

function prefersAppleMaps() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  );
}

/**
 * Builds a universal external-navigation URL without opening an intermediate
 * blank tab. Apple touch devices use Apple Maps; other platforms use Google
 * Maps, including Android and desktop browsers.
 */
export function directionsUrl(
  lat: number,
  lng: number,
  direction: NavigationDirection = "to",
  activity: NavigationActivity = "driving",
) {
  const coordinate = `${lat},${lng}`;
  if (prefersAppleMaps()) {
    const params = new URLSearchParams({
      [direction === "from" ? "saddr" : "daddr"]: coordinate,
      dirflg: activity === "walking" ? "w" : "d",
    });
    return `https://maps.apple.com/?${params}`;
  }
  const params = new URLSearchParams({
    api: "1",
    [direction === "from" ? "origin" : "destination"]: coordinate,
    travelmode: activity,
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
