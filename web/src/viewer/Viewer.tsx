import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Bambu Lab X1C als Standard-Druckbett, bis die Profil-Auswahl (Phase 2) kommt
const BED_X = 256;
const BED_Y = 256;

export interface ViewerHandle {
  setModel(geometry: THREE.BufferGeometry): void;
}

interface Props {
  onReady(handle: ViewerHandle): void;
}

export default function Viewer({ onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1115);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000);
    camera.up.set(0, 0, 1); // Z nach oben, wie in Slicern üblich
    camera.position.set(220, -220, 180);

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
      new THREE.PlaneGeometry(BED_X, BED_Y),
      new THREE.MeshStandardMaterial({ color: 0x171a21, roughness: 0.9 })
    );
    scene.add(bed);
    const grid = new THREE.GridHelper(BED_X, BED_X / 16, 0x2e3542, 0x232833);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.05;
    scene.add(grid);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(BED_X, BED_Y)),
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

    const handle: ViewerHandle = {
      setModel(geometry) {
        if (model) {
          scene.remove(model);
          model.geometry.dispose();
        }
        // Modell zentrieren und aufs Bett setzen
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox!;
        const center = new THREE.Vector3();
        bb.getCenter(center);
        geometry.translate(-center.x, -center.y, -bb.min.z);
        geometry.computeVertexNormals();

        model = new THREE.Mesh(geometry, material);
        scene.add(model);

        const size = new THREE.Vector3();
        bb.getSize(size);
        const dist = Math.max(size.x, size.y, size.z, 60) * 2.2;
        camera.position.set(dist, -dist, dist * 0.8);
        controls.target.set(0, 0, size.z / 2);
      },
    };

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

    onReadyRef.current(handle);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />;
}
