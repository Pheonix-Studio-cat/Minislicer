/**
 * Parst G-Code in Extrusions-Segmente pro Schicht — Datengrundlage für die
 * Schicht-Vorschau im Viewer (wie die Vorschau-Ansicht in Bambu Studio).
 */

export interface GcodeLayer {
  z: number;
  /** [x1,y1,z1, x2,y2,z2, ...] — Linien-Segmentpaare */
  points: Float32Array;
}

export function parseGcodeLayers(gcode: string): GcodeLayer[] {
  const acc: { z: number; pts: number[] }[] = [];
  let current: { z: number; pts: number[] } | null = null;
  let x = 0, y = 0, z = 0;

  for (const line of gcode.split("\n")) {
    if (line.startsWith(";LAYER:")) {
      current = { z, pts: [] };
      acc.push(current);
      continue;
    }
    const isG1 = line.startsWith("G1 ");
    if (!isG1 && !line.startsWith("G0 ")) continue;

    let nx = x, ny = y, nz = z, e = 0;
    for (const part of line.split(" ")) {
      const v = parseFloat(part.slice(1));
      if (Number.isNaN(v)) continue;
      switch (part[0]) {
        case "X": nx = v; break;
        case "Y": ny = v; break;
        case "Z": nz = v; break;
        case "E": e = v; break;
      }
    }

    if (isG1 && e > 0 && current) {
      current.pts.push(x, y, nz, nx, ny, nz);
      current.z = nz;
    }
    x = nx; y = ny; z = nz;
  }

  return acc
    .filter((l) => l.pts.length > 0)
    .map((l) => ({ z: l.z, points: new Float32Array(l.pts) }));
}
