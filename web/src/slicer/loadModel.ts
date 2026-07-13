import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const SUPPORTED_EXTENSIONS = ["stl", "obj", "3mf"] as const;

export function isSupportedFile(name: string): boolean {
  return /\.(stl|obj|3mf)$/i.test(name);
}

/** Reduziert eine Geometrie auf eine nicht-indizierte Dreiecks-Suppe (nur Positionen). */
function toTriangleSoup(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const soup = new THREE.BufferGeometry();
  soup.setAttribute("position", g.getAttribute("position").clone());
  if (matrix) soup.applyMatrix4(matrix);
  return soup;
}

/** Sammelt alle Meshes einer Szene (OBJ/3MF liefern Gruppen) in eine Geometrie. */
function collectMeshes(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateWorldMatrix(true, true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      parts.push(toTriangleSoup(mesh.geometry, mesh.matrixWorld));
    }
  });
  if (parts.length === 0) throw new Error("Datei enthält kein Mesh");
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (!merged) throw new Error("Meshes konnten nicht zusammengeführt werden");
  return merged;
}

/**
 * Lädt STL, OBJ oder 3MF in eine einzelne, nicht-indizierte BufferGeometry
 * (Einheit mm) — Grundlage für Viewer und Mesh-Analyse.
 */
export async function loadModel(file: File): Promise<THREE.BufferGeometry> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "stl":
      return toTriangleSoup(new STLLoader().parse(await file.arrayBuffer()));
    case "obj":
      return collectMeshes(new OBJLoader().parse(await file.text()));
    case "3mf":
      return collectMeshes(new ThreeMFLoader().parse(await file.arrayBuffer()));
    default:
      throw new Error(`Nicht unterstütztes Format: .${ext ?? "?"}`);
  }
}
