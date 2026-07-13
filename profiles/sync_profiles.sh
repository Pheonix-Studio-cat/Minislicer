#!/usr/bin/env bash
# Holt die Druckerprofile aus dem offiziellen BambuStudio-Repo (alle Hersteller)
# per Sparse-Checkout — nur resources/profiles, nicht das ganze Repo.
# Ausgabe: profiles/BambuStudio/resources/profiles/ (nicht eingecheckt, siehe .gitignore)
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d BambuStudio ]; then
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/bambulab/BambuStudio.git BambuStudio
  git -C BambuStudio sparse-checkout set resources/profiles
else
  git -C BambuStudio pull --ff-only
fi

echo "OK: $(find BambuStudio/resources/profiles -name '*.json' | wc -l) Profil-Dateien verfügbar"
