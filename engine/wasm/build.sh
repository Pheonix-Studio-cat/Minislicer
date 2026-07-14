#!/usr/bin/env bash
# Baut den Engine-Spike zu WebAssembly und legt ihn in web/public/engine ab.
# Voraussetzung: Emscripten (emcc) im PATH — https://emscripten.org/docs/getting_started/downloads.html
set -euo pipefail

cd "$(dirname "$0")"
OUT_DIR="../../web/public/engine"
mkdir -p build "$OUT_DIR"

# Eigen (header-only) wird von BambuStudios Clipper gebraucht — bei Bedarf holen
if [ ! -d vendor/eigen/Eigen ]; then
  echo "Lade Eigen 3.4.0 …"
  mkdir -p vendor/eigen
  curl -sL https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.gz |
    tar xz -C vendor/eigen --strip-components=1 eigen-3.4.0/Eigen
fi

emcc bindings.cpp vendor/clipper/clipper.cpp \
  -I. -Ivendor -Ivendor/eigen \
  -O3 \
  --bind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o build/minislicer_engine.js

cp build/minislicer_engine.js build/minislicer_engine.wasm "$OUT_DIR/"
echo "OK: Engine nach $OUT_DIR kopiert"
