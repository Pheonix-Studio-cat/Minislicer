import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import Viewer from "./viewer/Viewer";
import {
  analyzeMesh,
  engineVersion,
  MeshStats,
  sliceModel,
  SliceResult,
} from "./slicer/engine";
import { isSupportedFile, loadModel } from "./slicer/loadModel";
import { GcodeLayer, parseGcodeLayers } from "./slicer/gcodePreview";
import {
  loadPrinters,
  Printer,
  rememberPrinter,
  savedPrinterName,
} from "./profiles/printers";
import { currentLanguage, LANGUAGES, makeT, setLanguage } from "./i18n";
import SendPanel from "./device/SendPanel";

type Tab = "prepare" | "preview" | "device";

const FILAMENTS: Record<string, { nozzle: number; bed: number }> = {
  PLA: { nozzle: 220, bed: 55 },
  PETG: { nozzle: 240, bed: 70 },
  ABS: { nozzle: 250, bed: 90 },
  TPU: { nozzle: 230, bed: 50 },
};

const LAYER_HEIGHTS = [0.08, 0.12, 0.16, 0.2, 0.24, 0.28];

export default function App() {
  const [lang, setLang] = useState(currentLanguage());
  const t = useMemo(() => makeT(lang), [lang]);

  const [tab, setTab] = useState<Tab>("prepare");
  const [fileName, setFileName] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [stats, setStats] = useState<MeshStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);

  const [printers, setPrinters] = useState<Printer[]>([]);
  const [printerName, setPrinterName] = useState<string>(savedPrinterName());

  const [filament, setFilament] = useState<keyof typeof FILAMENTS>("PLA");
  const [nozzleTemp, setNozzleTemp] = useState(FILAMENTS.PLA.nozzle);
  const [bedTemp, setBedTemp] = useState(FILAMENTS.PLA.bed);
  const [layerHeight, setLayerHeight] = useState(0.2);
  const [speed, setSpeed] = useState(60);

  const [slicing, setSlicing] = useState(false);
  const [slice, setSlice] = useState<SliceResult | null>(null);
  const [previewLayers, setPreviewLayers] = useState<GcodeLayer[] | null>(null);
  const [previewLimit, setPreviewLimit] = useState(0);

  useEffect(() => {
    engineVersion().then((v) => setEngineReady(!!v));
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
  const vendors = useMemo(() => [...new Set(printers.map((p) => p.vendor))], [printers]);
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
  const selectFilament = (name: keyof typeof FILAMENTS) => {
    setFilament(name);
    setNozzleTemp(FILAMENTS[name].nozzle);
    setBedTemp(FILAMENTS[name].bed);
  };

  const resetSlice = () => {
    setSlice(null);
    setPreviewLayers(null);
    setPreviewLimit(0);
  };

  const openFile = useCallback(async (file: File) => {
    setError(null);
    resetSlice();
    setTab("prepare");
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
      else if (file) setError(`${file.name} — ${t("drop_hint")}`);
    },
    [openFile]
  );

  const doSlice = useCallback(async () => {
    if (!geometry) return;
    setSlicing(true);
    setError(null);
    try {
      // kurz rendern lassen, damit der „Slicing …“-Zustand sichtbar wird
      await new Promise((r) => setTimeout(r, 30));
      const positions = geometry.getAttribute("position").array as Float32Array;
      const result = await sliceModel(positions, {
        layerHeight,
        lineWidth: (printer?.nozzle ?? 0.4) * 1.05,
        speed,
        nozzleTemp,
        bedTemp,
      });
      const layers = parseGcodeLayers(result.gcode);
      setSlice(result);
      setPreviewLayers(layers);
      setPreviewLimit(layers.length);
      setTab("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSlicing(false);
    }
  }, [geometry, layerHeight, speed, nozzleTemp, bedTemp, printer]);

  const exportGcode = useCallback(() => {
    if (!slice) return;
    const blob = new Blob([slice.gcode], { type: "text/x-gcode" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (fileName?.replace(/\.[^.]+$/, "") ?? "minislicer") + ".gcode";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [slice, fileName]);

  const bedX = printer?.bed_x ?? 256;
  const bedY = printer?.bed_y ?? 256;
  const tooBig =
    stats && printer
      ? stats.size.x > printer.bed_x ||
        stats.size.y > printer.bed_y ||
        (printer.height !== null && stats.size.z > printer.height)
      : false;

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  };

  const showPreview = tab === "preview" && previewLayers !== null;

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <span className="brand">
          <span className="logo" />
          Minislicer
        </span>
        <nav className="tabs">
          {(["prepare", "preview", "device"] as Tab[]).map((id) => (
            <button
              key={id}
              className={`tab${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              {t(`tab_${id}`)}
            </button>
          ))}
        </nav>
        <span className="engine-tag">
          {engineReady === null ? "…" : engineReady ? "WASM" : t("engine_fallback")}
        </span>
        <select
          className="lang"
          aria-label={t("language")}
          value={lang}
          onChange={(e) => {
            setLanguage(e.target.value);
            setLang(e.target.value);
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <label className="open-btn">
          {t("open_model")}
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
        <aside className="sidebar">
          <span className="section-title">{t("printer")}</span>
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
            {printer ? (
              <div className="row">
                <span className="label">{t("build_volume")}</span>
                <span>
                  {printer.bed_x} × {printer.bed_y}
                  {printer.height !== null && <> × {printer.height}</>} mm
                </span>
              </div>
            ) : (
              <span className="note">{t("catalog_loading")}</span>
            )}
          </div>

          <span className="section-title">{t("filament")}</span>
          <div className="card">
            <select
              value={filament}
              onChange={(e) => selectFilament(e.target.value as keyof typeof FILAMENTS)}
            >
              {Object.keys(FILAMENTS).map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <div className="row">
              <span className="label">{t("nozzle_temp")}</span>
              <input
                type="number"
                value={nozzleTemp}
                min={150}
                max={320}
                onChange={(e) => setNozzleTemp(Number(e.target.value))}
              />
            </div>
            <div className="row">
              <span className="label">{t("bed_temp")}</span>
              <input
                type="number"
                value={bedTemp}
                min={0}
                max={120}
                onChange={(e) => setBedTemp(Number(e.target.value))}
              />
            </div>
          </div>

          <span className="section-title">{t("process")}</span>
          <div className="card">
            <div className="row">
              <span className="label">{t("layer_height")}</span>
              <select
                value={layerHeight}
                onChange={(e) => setLayerHeight(Number(e.target.value))}
              >
                {LAYER_HEIGHTS.map((h) => (
                  <option key={h} value={h}>
                    {h.toFixed(2)} mm
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <span className="label">{t("speed")}</span>
              <input
                type="number"
                value={speed}
                min={10}
                max={300}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </div>
            <span className="note">{t("sliced_note")}</span>
          </div>

          <span className="section-title">{t("model")}</span>
          <div className="card">
            {error && <span className="warn">{error}</span>}
            {fileName ? (
              <>
                <div className="row">
                  <span className="label">{t("file")}</span>
                  <span>{fileName}</span>
                </div>
                {stats ? (
                  <>
                    <div className="row">
                      <span className="label">{t("triangles")}</span>
                      <span>{stats.triangles.toLocaleString()}</span>
                    </div>
                    <div className="row">
                      <span className="label">{t("size")}</span>
                      <span>
                        {stats.size.x.toFixed(1)} × {stats.size.y.toFixed(1)} ×{" "}
                        {stats.size.z.toFixed(1)} mm
                      </span>
                    </div>
                    <div className="row">
                      <span className="label">{t("volume")}</span>
                      <span>{stats.volumeCm3.toFixed(2)} cm³</span>
                    </div>
                    {tooBig && <span className="warn">{t("too_big")}</span>}
                  </>
                ) : (
                  !error && <span className="badge">{t("analyzing")}</span>
                )}
              </>
            ) : (
              !error && <span className="note">{t("no_model")}</span>
            )}
          </div>

          {slice && (
            <>
              <span className="section-title">{t("tab_preview")}</span>
              <div className="card">
                <div className="row">
                  <span className="label">{t("layers")}</span>
                  <span>{slice.layers}</span>
                </div>
                <div className="row">
                  <span className="label">{t("est_time")}</span>
                  <span>{fmtTime(slice.timeSec)}</span>
                </div>
                <div className="row">
                  <span className="label">{t("filament_used")}</span>
                  <span>{(slice.filamentMm / 1000).toFixed(2)} m</span>
                </div>
                <button className="secondary" onClick={exportGcode}>
                  {t("export_gcode")}
                </button>
              </div>
            </>
          )}
        </aside>

        {tab === "device" ? (
          <div className="device-pane">
            <SendPanel
              gcode={slice?.gcode ?? null}
              gcodeName={(fileName?.replace(/\.[^.]+$/, "") ?? "minislicer") + ".gcode"}
              t={t}
            />
          </div>
        ) : (
          <div className="viewer-wrap">
            <Viewer
              bedX={bedX}
              bedY={bedY}
              geometry={geometry}
              previewLayers={showPreview ? previewLayers : null}
              previewLimit={previewLimit}
            />
            {!fileName && (
              <div className="dropzone-hint">
                <strong>{t("drop_hint")}</strong>
                <span>{t("or_open")}</span>
              </div>
            )}
            <div className="slice-action">
              <button
                className="primary"
                disabled={!geometry || slicing || engineReady === false}
                onClick={() => void doSlice()}
                title={engineReady === false ? t("engine_fallback") : undefined}
              >
                {slicing ? t("slicing") : t("slice_plate")}
              </button>
            </div>
            {showPreview && previewLayers.length > 0 && (
              <div className="layer-slider">
                <input
                  type="range"
                  min={1}
                  max={previewLayers.length}
                  value={previewLimit}
                  onChange={(e) => setPreviewLimit(Number(e.target.value))}
                />
                <span className="value">
                  {t("layer")} {previewLimit}/{previewLayers.length}
                </span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
