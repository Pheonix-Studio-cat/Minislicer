import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import Viewer from "./viewer/Viewer";
import { analyzeMesh, engineVersion, MeshStats } from "./slicer/engine";
import { isSupportedFile, loadModel } from "./slicer/loadModel";
import {
  loadPrinters,
  Printer,
  rememberPrinter,
  savedPrinterName,
} from "./profiles/printers";

export default function App() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [stats, setStats] = useState<MeshStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineInfo, setEngineInfo] = useState<string>("wird geladen …");

  const [printers, setPrinters] = useState<Printer[]>([]);
  const [printerName, setPrinterName] = useState<string>(savedPrinterName());

  useEffect(() => {
    engineVersion().then((v) =>
      setEngineInfo(v ? `WASM-Engine ${v}` : "JS-Fallback (Engine nicht gebaut)")
    );
    loadPrinters().then((list) => {
      setPrinters(list);
      if (list.length && !list.some((p) => p.name === savedPrinterName())) {
        setPrinterName(list[0].name);
      }
    });
  }, []);

  const printer = useMemo(
    () => printers.find((p) => p.name === printerName) ?? null,
    [printers, printerName]
  );
  const vendors = useMemo(
    () => [...new Set(printers.map((p) => p.vendor))],
    [printers]
  );
  const vendorPrinters = useMemo(
    () => printers.filter((p) => p.vendor === (printer?.vendor ?? "Bambu Lab")),
    [printers, printer]
  );

  const selectVendor = (vendor: string) => {
    const first = printers.find((p) => p.vendor === vendor);
    if (first) {
      setPrinterName(first.name);
      rememberPrinter(first.name);
    }
  };
  const selectPrinter = (name: string) => {
    setPrinterName(name);
    rememberPrinter(name);
  };

  const openFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const g = await loadModel(file);
      setGeometry(g);
      setFileName(file.name);
      setStats(null);
      const positions = g.getAttribute("position").array as Float32Array;
      setStats(await analyzeMesh(positions));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && isSupportedFile(file.name)) void openFile(file);
      else if (file) setError(`Nicht unterstütztes Format: ${file.name}`);
    },
    [openFile]
  );

  const bedX = printer?.bed_x ?? 256;
  const bedY = printer?.bed_y ?? 256;
  const tooBig =
    stats && printer
      ? stats.size.x > printer.bed_x ||
        stats.size.y > printer.bed_y ||
        (printer.height !== null && stats.size.z > printer.height)
      : false;

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <h1>Minislicer</h1>
        <span className="tag">Phase 0 · FDM</span>
        <span className="tag">{engineInfo}</span>
        <div className="spacer" />
        <label className="primary">
          Modell öffnen
          <input
            type="file"
            accept=".stl,.obj,.3mf"
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
          <Viewer bedX={bedX} bedY={bedY} geometry={geometry} />
          {!fileName && (
            <div className="dropzone-hint">
              <strong>STL-, OBJ- oder 3MF-Datei hierher ziehen</strong>
              <span>oder oben rechts „Modell öffnen"</span>
            </div>
          )}
        </div>

        <aside className="sidebar">
          <h2>Drucker</h2>
          <div className="card">
            <select
              value={printer?.vendor ?? ""}
              onChange={(e) => selectVendor(e.target.value)}
              disabled={!printers.length}
            >
              {vendors.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              value={printerName}
              onChange={(e) => selectPrinter(e.target.value)}
              disabled={!printers.length}
            >
              {vendorPrinters.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name.replace(`${p.vendor} `, "")}
                </option>
              ))}
            </select>
            {printer && (
              <div className="stat">
                <span className="label">Bauraum</span>
                <span>
                  {printer.bed_x} × {printer.bed_y}
                  {printer.height !== null && <> × {printer.height}</>} mm
                </span>
              </div>
            )}
            {!printers.length && (
              <span className="stat label">Katalog wird geladen …</span>
            )}
          </div>

          <h2>Modell</h2>
          <div className="card">
            {error && <span className="warn">{error}</span>}
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
                    {tooBig && (
                      <span className="warn">
                        Modell ist grösser als der Bauraum dieses Druckers!
                      </span>
                    )}
                    <span className="badge">
                      Analyse: {stats.backend === "wasm" ? "C++ (WebAssembly)" : "JavaScript"}
                    </span>
                  </>
                ) : (
                  !error && <span className="badge">Analysiere …</span>
                )}
              </>
            ) : (
              !error && <span className="stat label">Noch kein Modell geladen.</span>
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
