import { useCallback, useEffect, useRef, useState } from "react";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import Viewer, { ViewerHandle } from "./viewer/Viewer";
import { analyzeMesh, engineVersion, MeshStats } from "./slicer/engine";

export default function App() {
  const viewerRef = useRef<ViewerHandle | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [stats, setStats] = useState<MeshStats | null>(null);
  const [engineInfo, setEngineInfo] = useState<string>("wird geladen …");

  useEffect(() => {
    engineVersion().then((v) =>
      setEngineInfo(v ? `WASM-Engine ${v}` : "JS-Fallback (Engine nicht gebaut)")
    );
  }, []);

  const openFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const geometry = new STLLoader().parse(buffer);
    viewerRef.current?.setModel(geometry);
    setFileName(file.name);
    setStats(null);

    const positions = geometry.getAttribute("position").array as Float32Array;
    setStats(await analyzeMesh(positions));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && /\.stl$/i.test(file.name)) void openFile(file);
    },
    [openFile]
  );

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <h1>Minislicer</h1>
        <span className="tag">Phase 0 · FDM</span>
        <span className="tag">{engineInfo}</span>
        <div className="spacer" />
        <label className="primary">
          STL öffnen
          <input
            type="file"
            accept=".stl"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void openFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </header>

      <main className="main">
        <div className="viewer-wrap">
          <Viewer onReady={(h) => (viewerRef.current = h)} />
          {!fileName && (
            <div className="dropzone-hint">
              <strong>STL-Datei hierher ziehen</strong>
              <span>oder oben rechts „STL öffnen" – Druckbett: Bambu Lab X1C (256 × 256 mm)</span>
            </div>
          )}
        </div>

        <aside className="sidebar">
          <h2>Modell</h2>
          <div className="card">
            {fileName ? (
              <>
                <div className="stat">
                  <span className="label">Datei</span>
                  <span>{fileName}</span>
                </div>
                {stats ? (
                  <>
                    <div className="stat">
                      <span className="label">Dreiecke</span>
                      <span>{stats.triangles.toLocaleString("de-CH")}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Grösse</span>
                      <span>
                        {stats.size.x.toFixed(1)} × {stats.size.y.toFixed(1)} ×{" "}
                        {stats.size.z.toFixed(1)} mm
                      </span>
                    </div>
                    <div className="stat">
                      <span className="label">Volumen</span>
                      <span>{stats.volumeCm3.toFixed(2)} cm³</span>
                    </div>
                    <div className="stat">
                      <span className="label">Oberfläche</span>
                      <span>{stats.surfaceCm2.toFixed(1)} cm²</span>
                    </div>
                    <span className="badge">
                      Analyse: {stats.backend === "wasm" ? "C++ (WebAssembly)" : "JavaScript"}
                    </span>
                  </>
                ) : (
                  <span className="badge">Analysiere …</span>
                )}
              </>
            ) : (
              <span className="stat label">Noch kein Modell geladen.</span>
            )}
          </div>

          <h2>Nächste Schritte</h2>
          <div className="card">
            <div className="stat">
              <span className="label">Phase 1</span>
              <span>libslic3r → WASM</span>
            </div>
            <div className="stat">
              <span className="label">Phase 2</span>
              <span>Profile & Slicing-UI</span>
            </div>
            <div className="stat">
              <span className="label">Phase 3</span>
              <span>KI (Llama 3)</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
