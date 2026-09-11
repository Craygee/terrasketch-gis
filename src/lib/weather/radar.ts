export interface WeatherRadarSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function radarSiteDistanceKm(
  site: WeatherRadarSite,
  point: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6_371;
  const latitudeDelta = radians(point.latitude - site.latitude);
  const longitudeDelta = radians(point.longitude - site.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(site.latitude)) *
      Math.cos(radians(point.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestWeatherRadarSite(
  sites: WeatherRadarSite[],
  point: { latitude: number; longitude: number },
) {
  return sites.reduce<{ site: WeatherRadarSite; distanceKm: number } | null>((nearest, site) => {
    const distanceKm = radarSiteDistanceKm(site, point);
    return !nearest || distanceKm < nearest.distanceKm ? { site, distanceKm } : nearest;
  }, null);
}
