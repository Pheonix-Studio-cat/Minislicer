import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface Props {
  bedX: number;
  bedY: number;
  geometry: THREE.BufferGeometry | null;
}

interface SceneHandle {
  setModel(geometry: THREE.BufferGeometry): void;
}

export default function Viewer({ bedX, bedY, geometry }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  // Szene aufbauen — wird bei Druckerwechsel (Bettgrösse) neu erstellt
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1115);

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(150, -200, 300);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-200, 150, 100);
    scene.add(fill);

    // Druckbett: Platte + Raster + Umrandung
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(bedX, bedY),
      new THREE.MeshStandardMaterial({ color: 0x171a21, roughness: 0.9 })
    );
    scene.add(bed);
    const grid = new THREE.GridHelper(Math.max(bedX, bedY), Math.round(Math.max(bedX, bedY) / 16), 0x2e3542, 0x232833);
    grid.rotation.x = Math.PI / 2;
    grid.scale.set(bedX / Math.max(bedX, bedY), 1, bedY / Math.max(bedX, bedY));
    grid.position.z = 0.05;
    scene.add(grid);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(bedX, bedY)),
      new THREE.LineBasicMaterial({ color: 0x35c56f })
    );
    outline.position.z = 0.1;
    scene.add(outline);

    let model: THREE.Mesh | null = null;
    const material = new THREE.MeshStandardMaterial({
      color: 0x35c56f,
      roughness: 0.55,
      metalness: 0.05,
    });

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
      },
    };

    // Bereits geladenes Modell nach Druckerwechsel wieder anzeigen
    if (geometryRef.current) handleRef.current.setModel(geometryRef.current);

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

  // Neues Modell in die bestehende Szene laden
  useEffect(() => {
    if (geometry) handleRef.current?.setModel(geometry);
  }, [geometry]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />;
}
