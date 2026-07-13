# Minislicer

Ein Web-Slicer für alles und jedes Gerät — basiert auf dem Slicing-Kern von
[BambuStudio](https://github.com/bambulab/BambuStudio), läuft komplett im Browser (WebAssembly)
und funktioniert auf PC, Laptop, Tablet und Handy.

## Ziele

- **Alle Druckerprofile aus BambuStudio** (Bambu Lab + Drittanbieter)
- **KI-Systeme mit Llama 3** für Auto-Platzierung und Supports (nur FDM)
- **Resin/SLA-Funktion aus PrusaSlicer** für bekannte Resin-Drucker (Phase 2, ohne KI)
- **Anmeldung optional** — ohne Login voll nutzbar
- **PWA** — installierbar, offline-fähig

Der vollständige Projektplan liegt in [`docs/PLAN.md`](docs/PLAN.md).

## Repo-Struktur

```
web/       React-PWA (Vite + TypeScript + Three.js) — UI, 3D-Viewer, Worker-Anbindung
engine/    C++ → WebAssembly (Emscripten): Slicing-Kern, aktuell "Hello WASM"-Spike
profiles/  Sync-Skript für die BambuStudio-Druckerprofile
docs/      Projektplan und Architektur
```

## Entwicklung

```bash
# Web-App starten
cd web
npm install
npm run dev

# Engine (WASM) bauen — benötigt Emscripten (emsdk)
cd engine/wasm
./build.sh
```

## Status

- **UI im Bambu-Studio-Stil**: Tabs Vorbereiten/Vorschau/Gerät, Panels für Drucker/Filament/Prozess
- **Import**: STL, OBJ und 3MF
- **Drucker**: 202 Modelle von 12 Herstellern aus den originalen BambuStudio-Profilen (inkl. H2C/H2D/X2D/P2S)
- **Slicing**: Kontur-Slicer in C++ (WASM) mit G-Code-Export und Schicht-Vorschau
  — bewusst vereinfacht (nur Aussenwände); der volle libslic3r-Kern folgt in Phase 1
- **Senden**: G-Code-Upload an OctoPrint und Klipper/Moonraker
- **Sprachen**: alle 18 Sprachen aus BambuStudio

## Lizenz

AGPL-3.0 — Minislicer baut auf BambuStudio und PrusaSlicer (beide AGPL-3.0) auf.
KI-Funktionen: „Built with Llama" (Meta Llama Community License).
