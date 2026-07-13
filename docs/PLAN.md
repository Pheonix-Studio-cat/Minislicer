# Minislicer — Web-Slicer auf BambuStudio-Basis mit Llama-3-KI

## Kontext

Das Repo `Pheonix-Studio-cat/Minislicer` ist leer (nur README). Ziel ist ein neuer Slicer:

- **Basiert auf BambuStudio** (C++-Slicing-Kern `libslic3r`), läuft **im Browser via WebAssembly** — kein Server fürs Slicen nötig
- **Alle Druckerprofile aus BambuStudio** (Bambu Lab + alle Drittanbieter aus `resources/profiles`)
- **KI-Systeme mit Llama 3 (Meta)** für Platzierung und Supports — nur für FDM
- **Resin/SLA-Funktion aus PrusaSlicer** für bekannte Resin-Drucker (Phase 2, ohne KI)
- **Web-App für PC, Laptop, Tablet, Handy** (responsive PWA)
- **Anmeldung optional** — ohne Login voll nutzbar, mit Login Cloud-Speicherung

**Entscheidungen des Nutzers:** Browser/WASM-Architektur · Llama 3 als KI · FDM zuerst, Resin danach.

## Ehrliche Einschätzung (wichtig)

- **Machbar: ja** — aber das ist ein Mehrmonatsprojekt. Der WASM-Port von libslic3r ist der härteste Teil; es gibt Präzedenzfälle (cura-wasm, experimentelle PrusaSlicer-WASM-Ports), aber für BambuStudio ist es Pionierarbeit.
- **Llama 3 kann keine Geometrie berechnen.** Ein Sprachmodell kann keine Rotationsmatrizen oder Support-Punkte "ausdenken". Lösung: **Llama 3 als Orchestrator** — es analysiert die Modell-Metriken (Überhänge, Standfläche, Höhe), entscheidet die Strategie und ruft geometrische Werkzeuge mit den passenden Parametern auf (Tool-/Function-Calling). Die Werkzeuge (Tweaker-3-Orientierung, libnest2d-Arrange, Überhang-Erkennung) liefern die exakte Geometrie. Für den Nutzer fühlt es sich wie eine KI an, die platziert und supportet — und die Ergebnisse stimmen.
- **Llama 3 im Browser:** via WebLLM (WebGPU) mit **Llama 3.2 3B Instruct** (quantisiert, ~2 GB Download, gecacht). Auf Handys ohne WebGPU/RAM: automatischer Fallback auf reine Algorithmen (gleiche Werkzeuge, ohne LLM-Zwischenschicht) — die App funktioniert überall, die LLM-Schicht ist ein Upgrade.
- **Lizenzen:** BambuStudio & PrusaSlicer sind **AGPL-3.0** → Minislicer muss AGPL-3.0 sein und der Quellcode öffentlich bleiben (ist er: GitHub). Llama 3: Meta Llama Community License → Hinweis „Built with Llama" in der UI.

## Architektur

```
Browser (PWA, responsive)
├── UI: React + TypeScript + Three.js (3D-Viewer, Druckbett, G-Code-Vorschau)
├── Slicing: libslic3r (BambuStudio-Fork) → WASM, läuft im Web Worker
├── KI: WebLLM + Llama 3.2 3B  ──ruft auf──►  Geometrie-Tools (WASM):
│      • auto_orient (Tweaker-3)  • auto_arrange (libnest2d, in libslic3r enthalten)
│      • analyze_overhangs        • tune_supports (Tree/Normal-Parameter)
├── Profile: BambuStudio resources/profiles (JSON) — alle Hersteller, lazy geladen
└── Speicher: lokal (IndexedDB/OPFS) · optional Cloud bei Login (Supabase: Auth + Storage)
```

Kein eigener Slicing-Server. Einziger Backend-Baustein: Supabase (verwaltet) für optionalen Login + Projekt-Sync. Statisches Hosting (z. B. GitHub Pages/Cloudflare Pages) mit COOP/COEP-Headern für WASM-Threads.

## Repo-Struktur (Monorepo)

```
Minislicer/
├── engine/          # Git-Submodul: BambuStudio-Fork + Emscripten-Build von libslic3r
│   ├── wasm/        # C++-Bindings (embind): slice(), arrange(), orient(), analyze()
│   └── CMake-Toolchain für Emscripten
├── web/             # React-PWA (Vite, TypeScript, Three.js, Tailwind)
│   ├── src/viewer/  # 3D-Szene, Druckbett, Gizmos, G-Code-Preview
│   ├── src/slicer/  # Worker-Anbindung an engine-WASM
│   ├── src/ai/      # WebLLM-Runtime, Tool-Definitionen, Fallback-Pfad
│   └── src/profiles/# Profil-Lader/-Parser (BambuStudio-JSON-Vererbung)
├── profiles/        # Sync-Skript, das resources/profiles aus BambuStudio zieht
└── docs/            # Architektur, Lizenz-Hinweise (AGPL, Llama)
```

## Phasenplan

### Phase 0 — Fundament (Woche 1–2)
- Monorepo aufsetzen: Vite-React-PWA in `web/`, CI (GitHub Actions: Build + Lint + Emscripten-Build).
- BambuStudio als Fork/Submodul in `engine/`, Emscripten-Toolchain, „Hello WASM": ein Minimal-Modul, das ein STL lädt und Mesh-Statistiken zurückgibt (beweist die Werkzeugkette).
- Responsive App-Shell: Layout für Desktop (Seitenleisten) und Mobil (Bottom-Sheets), Datei-Upload (STL/3MF/OBJ), Three.js-Viewer mit Modell-Anzeige.

### Phase 1 — Slicing-Kern als WASM (Woche 3–8, kritischer Pfad)
- `libslic3r` aus BambuStudio isoliert bauen (ohne GUI/wxWidgets/Netzwerk-Plugin).
- Abhängigkeiten für Emscripten portieren: Boost (header-mostly ok), TBB → Emscripten-pthreads (SharedArrayBuffer) oder Single-Thread-Fallback; **STEP/OpenCASCADE zunächst weglassen** (nur STL/3MF/OBJ — deckt 99 % ab).
- embind-API: `loadModel`, `applyProfile`, `slice` (mit Fortschritts-Callback), `getGcode`, `getLayerPreview`.
- Läuft im Web Worker; Speicher-Budget beachten (WASM 4-GB-Grenze; große Modelle → Warnung).
- **Meilenstein:** Benchy als STL rein → G-Code für Bambu X1C raus, identisch zu Desktop-BambuStudio.

### Phase 2 — Profile & Slicer-UI (Woche 7–12, überlappt)
- Sync-Skript für `resources/profiles` (alle Hersteller: Bambu Lab, Creality, Voron, Prusa, Anycubic …) inkl. BambuStudio-Profil-Vererbung (`inherits`-Ketten auflösen).
- Drucker-/Filament-/Prozess-Auswahl-UI, Settings-Editor (Basis- und Expertenmodus), mehrere Objekte auf der Platte, Move/Rotate/Scale-Gizmos.
- G-Code-Vorschau (Layer-Slider, Feature-Farben), Export als Datei-Download.

### Phase 3 — KI-Schicht mit Llama 3 (Woche 10–16, überlappt)
- Geometrie-Tools zuerst (funktionieren auch ohne LLM — das ist der Handy-Fallback):
  - `auto_orient`: Tweaker-3-Algorithmus (Python-Referenz → TypeScript/C++-Port) — minimiert Überhänge/Supportvolumen.
  - `auto_arrange`: libnest2d aus libslic3r über die WASM-API exponieren.
  - `analyze_overhangs`: Facetten-Analyse (Winkel, Inseln, Brücken) aus libslic3r.
  - `tune_supports`: setzt Tree-/Normal-Support-Parameter im Profil.
- WebLLM-Integration: Llama 3.2 3B Instruct (q4), Download mit Fortschritt, Cache in OPFS; Feature-Detection für WebGPU → sonst Algorithmus-Modus ohne LLM.
- Llama-Orchestrierung per Tool-Calling: Modell-Metriken als Kontext → LLM wählt Strategie („flachste Seite nach unten, Tree-Supports nur außen, 15° Schwelle") → Tools ausführen → Ergebnis erklären. Plus Chat-Panel: „Warum diese Orientierung?", „Mach es stabiler".
- UI-Kennzeichnung „Built with Llama".

### Phase 4 — Optionaler Login & Cloud (Woche 14–18)
- Supabase: E-Mail/OAuth-Login, **strikt optional** — Gast-Modus bleibt voll funktionsfähig (Projekte in IndexedDB/OPFS).
- Mit Login: Projekte (3MF + Einstellungen) und eigene Profile geräteübergreifend synchronisieren.

### Phase 5 — Resin/SLA aus PrusaSlicer (Woche 18–26)
- Vorteil: BambuStudio ist ein PrusaSlicer-Fork — die SLA-Engine (`libslic3r/SLA/`, `SLAPrint`) lässt sich aus PrusaSlicer in unseren libslic3r-Baum zurückportieren (Bambu hat sie entfernt/stillgelegt).
- SLA-Slicing als zweiter WASM-Pfad: Schichtbilder + Hohlraum/Drainage + manuelle & automatische SLA-Stützen (PrusaSlicer-Algorithmus, **bewusst ohne LLM-KI**, wie gewünscht).
- Resin-Druckerprofile aus PrusaSlicer-Ressourcen (Prusa SL1/SL1S) + gängige Formate für bekannte Resin-Drucker (Elegoo/Anycubic: `.ctb`/`.pwmx` via UVtools-kompatible Writer — Format-Support schrittweise).
- Resin-UI: eigener Modus-Schalter FDM ⇄ Resin, Schicht-Vorschau als Bilder.

### Phase 6 — Politur & PWA (laufend, Abschluss Woche 26+)
- PWA: Offline-Betrieb (Service Worker cached App + WASM + gewählte Profile), „Zum Startbildschirm hinzufügen".
- Mobile Feinschliff: Touch-Gizmos, reduzierte Viewer-Qualität auf schwachen Geräten, Speicher-Wächter.
- AGPL-Konformität: Lizenzdatei, „Quellcode"-Link in der UI, Drittlizenz-Übersicht.

## Größte Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| libslic3r-WASM-Port scheitert an einer Abhängigkeit | Phase 1 früh als Spike; Notfallplan: schlankerer Kern (nur benötigte Module) oder als letzte Option serverseitiges Slicen nachrüsten |
| Llama im Browser zu schwer für Handys | Fallback-Modus ohne LLM ist von Anfang an der Basispfad; LLM ist Zusatzschicht |
| 4-GB-WASM-Speichergrenze bei großen Modellen | Mesh-Vereinfachung beim Import, Warnungen, Slicing in Regionen |
| Profil-Vererbung von BambuStudio komplex | Parser gegen Desktop-BambuStudio-Ausgaben testen (gleiche aufgelöste Werte) |

## Verifikation

- **Phase-1-Abnahme:** Referenzmodelle (Benchy, Kalibrierwürfel) im Web slicen und G-Code per Diff mit Desktop-BambuStudio (gleiches Profil, gleiche Version) vergleichen.
- **Geräte-Matrix:** Chrome/Firefox/Safari auf Desktop, Android-Chrome, iOS-Safari — Upload → Slice → G-Code-Download durchspielen.
- **KI-Tests:** Testmodelle mit bekannten Ideal-Orientierungen; prüfen, dass `auto_orient` Supportvolumen messbar reduziert und der LLM-Pfad dieselben Tools korrekt aufruft.
- **Resin-Abnahme (Phase 5):** SL1-Export gegen PrusaSlicer-Desktop-Ausgabe vergleichen (Schichtbilder pixelweise diffen).
- CI: Engine-Build, Unit-Tests der Profil-Auflösung, Playwright-E2E (Upload→Slice→Export) mit dem vorinstallierten Chromium.

## Erster konkreter Arbeitsschritt nach Freigabe

Phase 0 auf Branch `claude/planning-session-qfej86`: Monorepo-Gerüst, Vite-React-PWA mit Three.js-Viewer und STL-Upload, Emscripten-„Hello-WASM"-Spike, CI — dann committen und pushen.
