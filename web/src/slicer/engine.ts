/**
 * Anbindung an den WASM-Engine-Spike (engine/wasm/bindings.cpp).
 *
 * Der Spike beweist die Werkzeugkette C++ → Emscripten → Browser und liefert
 * Mesh-Statistiken. Später wird hieraus die volle libslic3r-Anbindung
 * (loadModel / applyProfile / slice / getGcode) in einem Web Worker.
 *
 * Fällt der WASM-Load aus (Engine nicht gebaut, alter Browser), rechnet ein
 * JS-Fallback dieselben Werte — die App bleibt immer benutzbar.
 */

export interface MeshStats {
  triangles: number;
  volumeCm3: number;
  surfaceCm2: number;
  size: { x: number; y: number; z: number };
  backend: "wasm" | "js";
}

interface EngineModule {
  analyzeMesh(positions: Float32Array): string;
  sliceMesh(
    positions: Float32Array,
    layerHeight: number,
    lineWidth: number,
    speed: number,
    nozzleTemp: number,
    bedTemp: number
  ): string;
  version(): string;
}

export interface SliceSettings {
  layerHeight: number;
  lineWidth: number;
  speed: number;
  nozzleTemp: number;
  bedTemp: number;
}

export interface SliceResult {
  gcode: string;
  layers: number;
  timeSec: number;
  filamentMm: number;
}

let enginePromise: Promise<EngineModule | null> | null = null;

async function loadEngine(): Promise<EngineModule | null> {
  if (!enginePromise) {
    enginePromise = (async () => {
      try {
        const url = `${import.meta.env.BASE_URL}engine/minislicer_engine.js`;
        const factory = (await import(/* @vite-ignore */ url)).default;
        return (await factory()) as EngineModule;
      } catch {
        return null;
      }
    })();
  }
  return enginePromise;
}

export async function engineVersion(): Promise<string | null> {
  const engine = await loadEngine();
  return engine ? engine.version() : null;
}

/** Sliced das Modell in der WASM-Engine und liefert G-Code + Kennzahlen. */
export async function sliceModel(
  positions: Float32Array,
  s: SliceSettings
): Promise<SliceResult> {
  const engine = await loadEngine();
  if (!engine) throw new Error("WASM-Engine nicht verfügbar");
  const gcode = engine.sliceMesh(
    positions,
    s.layerHeight,
    s.lineWidth,
    s.speed,
    s.nozzleTemp,
    s.bedTemp
  );
  const num = (key: string) =>
    parseFloat(gcode.match(new RegExp(`; ${key} = ([\\d.]+)`))?.[1] ?? "0");
  return {
    gcode,
    layers: num("minislicer_layers"),
    timeSec: num("minislicer_time_s"),
    filamentMm: num("minislicer_filament_mm"),
  };
}

/** positions: flaches Array aus Dreiecks-Eckpunkten (x,y,z je Vertex), in mm. */
export async function analyzeMesh(positions: Float32Array): Promise<MeshStats> {
  const engine = await loadEngine();
  if (engine) {
    const raw = JSON.parse(engine.analyzeMesh(positions));
    return {
      triangles: raw.triangles,
      volumeCm3: raw.volume_mm3 / 1000,
      surfaceCm2: raw.surface_mm2 / 100,
      size: { x: raw.size_x, y: raw.size_y, z: raw.size_z },
      backend: "wasm",
    };
  }
  return analyzeMeshJs(positions);
}

function analyzeMeshJs(p: Float32Array): MeshStats {
  let volume = 0;
  let surface = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
    const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];

    // Signiertes Tetraeder-Volumen gegen den Ursprung
    volume +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) / 6;

    // Dreiecksfläche über Kreuzprodukt
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    surface += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
  }

  for (let i = 0; i < p.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = p[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }

  return {
    triangles: p.length / 9,
    volumeCm3: Math.abs(volume) / 1000,
    surfaceCm2: surface / 100,
    size: {
      x: p.length ? max[0] - min[0] : 0,
      y: p.length ? max[1] - min[1] : 0,
      z: p.length ? max[2] - min[2] : 0,
    },
    backend: "js",
  };
}
