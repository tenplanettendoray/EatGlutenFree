export function globeViewport(width: number, height: number, compact: boolean) {
  const safeWidth = Math.max(1, width), safeHeight = Math.max(1, height);
  // Preserve the globe's width on portrait phones without pushing the camera
  // beyond its zoom limits. A keyboard resize changes framing, not zoom state.
  const fov = compact
    ? 2 * Math.atan(Math.tan(17 * Math.PI / 180) * safeHeight / Math.min(safeWidth, safeHeight)) * 180 / Math.PI
    : 34;
  const diameter = compact
    ? Math.min(safeHeight * .88, safeWidth * .92)
    : Math.min(safeHeight * 1.08, safeWidth * (safeWidth > 600 ? .62 : .92));
  const overviewDistance = 1.45 / Math.sin(Math.atan(diameter / safeHeight * Math.tan(fov * Math.PI / 360)));
  return { fov, overviewDistance };
}
