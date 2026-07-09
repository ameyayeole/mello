export interface ClusterPoint {
  lat: number;
  lng: number;
}

export interface Cluster<T extends ClusterPoint> {
  /** Centroid of the clustered points. */
  lat: number;
  lng: number;
  items: T[];
}

/**
 * Greedy distance-based clustering scaled to the visible region: points
 * closer than ~1/8 of the screen width merge into one cluster, so what
 * counts as "overlapping" changes with the zoom level.
 */
export function clusterPoints<T extends ClusterPoint>(
  points: T[],
  longitudeDelta: number
): Cluster<T>[] {
  const radius = longitudeDelta / 8;
  const clusters: Cluster<T>[] = [];

  for (const point of points) {
    const hit = clusters.find(
      (c) =>
        Math.abs(c.lat - point.lat) < radius &&
        Math.abs(c.lng - point.lng) < radius
    );
    if (hit) {
      hit.items.push(point);
      hit.lat =
        hit.items.reduce((sum, p) => sum + p.lat, 0) / hit.items.length;
      hit.lng =
        hit.items.reduce((sum, p) => sum + p.lng, 0) / hit.items.length;
    } else {
      clusters.push({ lat: point.lat, lng: point.lng, items: [point] });
    }
  }

  return clusters;
}
