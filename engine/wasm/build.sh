#!/usr/bin/env bash
# Baut den Engine-Spike zu WebAssembly und legt ihn in web/public/engine ab.
# Voraussetzung: Emscripten (emcc) im PATH — https://emscripten.org/docs/getting_started/downloads.html
set -euo pipefail

cd "$(dirname "$0")"
OUT_DIR="../../web/public/engine"
mkdir -p build "$OUT_DIR"

emcc bindings.cpp \
  -O3 \
  --bind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o build/minislicer_engine.js

cp build/minislicer_engine.js build/minislicer_engine.wasm "$OUT_DIR/"
echo "OK: Engine nach $OUT_DIR kopiert"
