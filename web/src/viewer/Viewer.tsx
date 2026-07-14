import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GcodeLayer } from "../slicer/gcodePreview";

interface Props {
  bedX: number;
  bedY: number;
  geometry: THREE.BufferGeometry | null;
  /** G-Code-Schichten für die Vorschau (null = Modellansicht) */
  previewLayers: GcodeLayer[] | null;
  /** Bis zu welcher Schicht (exklusiv) die Vorschau gezeichnet wird */
  previewLimit: number;
}

interface SceneHandle {
  setModel(geometry: THREE.BufferGeometry): void;
  setPreview(layers: GcodeLayer[] | null): void;
  setPreviewLimit(limit: number): void;
}

export default function Viewer({ bedX, bedY, geometry, previewLayers, previewLimit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const previewRef = useRef(previewLayers);
  previewRef.current = previewLayers;
  const limitRef = useRef(previewLimit);
  limitRef.current = previewLimit;

  // Szene aufbauen — wird bei Druckerwechsel (Bettgrösse) neu erstellt
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd6dce4); // helles Viewport-Grau wie Bambu Studio

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000);
    camera.up.set(0, 0, 1); // Z nach oben, wie in Slicern üblich
    const startDist = Math.max(bedX, bedY) * 1.1;
    camera.position.set(startDist, -startDist, startDist * 0.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 20);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(150, -200, 300);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-200, 150, 100);
    scene.add(fill);

    // Druckbett: dunkle Platte + Raster + grüne Umrandung
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(bedX, bedY),
      new THREE.MeshStandardMaterial({ color: 0x30353d, roughness: 0.92 })
    );
    scene.add(bed);
    const maxDim = Math.max(bedX, bedY);
    const grid = new THREE.GridHelper(maxDim, Math.round(maxDim / 16), 0x4a515c, 0x3b414b);
    grid.rotation.x = Math.PI / 2;
    grid.scale.set(bedX / maxDim, 1, bedY / maxDim);
    grid.position.z = 0.05;
    scene.add(grid);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(bedX, bedY)),
      new THREE.LineBasicMaterial({ color: 0xee5622 })
    );
    outline.position.z = 0.1;
    scene.add(outline);

    let model: THREE.Mesh | null = null;
    const material = new THREE.MeshStandardMaterial({
      color: 0xee5622,
      roughness: 0.55,
      metalness: 0.05,
    });

    let lines: THREE.LineSegments | null = null;
    let layerOffsets: number[] = []; // kumulative Vertex-Anzahl je Schicht

    const applyVisibility = () => {
      const preview = previewRef.current;
      if (model) model.visible = !preview;
      if (lines) {
        lines.visible = !!preview;
        const li = Math.min(limitRef.current, layerOffsets.length - 1);
        lines.geometry.setDrawRange(0, layerOffsets[Math.max(0, li)] ?? 0);
      }
    };

    handleRef.current = {
      setModel(g) {
        if (model) scene.remove(model);
        // Modell zentrieren und aufs Bett setzen
        g.computeBoundingBox();
        const bb = g.boundingBox!;
        const center = new THREE.Vector3();
        bb.getCenter(center);
        g.translate(-center.x, -center.y, -bb.min.z);
        g.computeVertexNormals();

        model = new THREE.Mesh(g, material);
        scene.add(model);

        const size = new THREE.Vector3();
        bb.getSize(size);
        const dist = Math.max(size.x, size.y, size.z, bedX * 0.3) * 2.2;
        camera.position.set(dist, -dist, dist * 0.8);
        controls.target.set(0, 0, size.z / 2);
        applyVisibility();
      },
      setPreview(layers) {
        if (lines) {
          scene.remove(lines);
          lines.geometry.dispose();
          lines = null;
          layerOffsets = [];
        }
        if (layers && layers.length) {
          let total = 0;
          layerOffsets = [0];
          for (const l of layers) {
            total += l.points.length / 3;
            layerOffsets.push(total);
          }
          const all = new Float32Array(total * 3);
          let off = 0;
          for (const l of layers) {
            all.set(l.points, off);
            off += l.points.length;
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(all, 3));
          lines = new THREE.LineSegments(
            g,
            new THREE.LineBasicMaterial({ color: 0xee5622 })
          );
          scene.add(lines);
        }
        applyVisibility();
      },
      setPreviewLimit() {
        applyVisibility();
      },
    };

    // Zustand nach Szenen-Neuaufbau (z. B. Druckerwechsel) wiederherstellen
    if (geometryRef.current) handleRef.current.setModel(geometryRef.current);
    if (previewRef.current) handleRef.current.setPreview(previewRef.current);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      handleRef.current = null;
      mount.removeChild(renderer.domElement);
    };
  }, [bedX, bedY]);

  useEffect(() => {
    if (geometry) handleRef.current?.setModel(geometry);
  }, [geometry]);

  useEffect(() => {
    handleRef.current?.setPreview(previewLayers);
  }, [previewLayers]);

  useEffect(() => {
    handleRef.current?.setPreviewLimit(previewLimit);
  }, [previewLimit]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />;
}
