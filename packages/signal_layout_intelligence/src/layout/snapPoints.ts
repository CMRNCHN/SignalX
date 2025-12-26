export function nearestSnap(value: number, snaps: number[], threshold = 10) {
  let best = value;
  let bestDist = Infinity;
  for (const s of snaps) {
    const d = Math.abs(value - s);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  return bestDist <= threshold ? best : value;
}
