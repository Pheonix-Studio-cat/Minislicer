# Minislicer Engine (C++ → WebAssembly)

Hier entsteht der Slicing-Kern: `libslic3r` aus dem BambuStudio-Fork, kompiliert mit
Emscripten und im Browser in einem Web Worker ausgeführt.

## Aktueller Stand (Phase 0)

`wasm/bindings.cpp` ist der **„Hello WASM"-Spike**: eine Mesh-Analyse
(Dreiecke, Bounding-Box, Volumen, Oberfläche) über embind. Er beweist die
Werkzeugkette und liefert die Datengrundlage für die späteren KI-Werkzeuge.

## Bauen

```bash
# Emscripten installieren (einmalig)
git clone https://github.com/emscripten-core/emsdk.git
./emsdk/emsdk install latest && ./emsdk/emsdk activate latest
source ./emsdk/emsdk_env.sh

# Engine bauen → Ausgabe landet in web/public/engine/
cd wasm && ./build.sh
```

Ohne gebaute Engine nutzt die Web-App automatisch einen JS-Fallback.

## Phase 1 (nächster Schritt)

- BambuStudio als Fork/Submodul einbinden, `libslic3r` ohne GUI isolieren
- Abhängigkeiten für Emscripten: Boost, TBB→pthreads/Single-Thread, ohne OpenCASCADE
- embind-API: `loadModel`, `applyProfile`, `slice` (Fortschritts-Callback), `getGcode`
