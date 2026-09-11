export function coordinatesFromSearch(params: URLSearchParams) {
  const lat = params.get("lat"), lon = params.get("lon");
  if (!lat?.trim() || !lon?.trim()) return null;
  const latitude = Number(lat), longitude = Number(lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude } : null;
}
