#!/usr/bin/env python3
"""Erzeugt einen kompakten Drucker-Katalog aus den BambuStudio-Profilen.

Liest alle Hersteller unter BambuStudio/resources/profiles/<Vendor>/machine/,
löst die `inherits`-Ketten auf und schreibt web/public/profiles/printers.json:

  [{"vendor", "name", "bed_x", "bed_y", "height", "nozzle"}, ...]

Vorher ./sync_profiles.sh ausführen.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
PROFILES = ROOT / "BambuStudio" / "resources" / "profiles"
OUT = ROOT.parent / "web" / "public" / "profiles" / "printers.json"


def load_vendor_machines(vendor_dir: Path) -> dict[str, dict]:
    machines: dict[str, dict] = {}
    for f in (vendor_dir / "machine").glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if isinstance(data, dict) and "name" in data:
            machines[data["name"]] = data
    return machines


def resolve(machines: dict[str, dict], name: str, key: str):
    """Folgt der inherits-Kette, bis `key` gefunden ist."""
    seen = set()
    current = name
    while current and current not in seen:
        seen.add(current)
        node = machines.get(current)
        if node is None:
            return None
        if key in node:
            return node[key]
        current = node.get("inherits")
    return None


def bed_size(printable_area) -> tuple[float, float] | None:
    """printable_area: Liste von "XxY"-Eckpunkten → Breite/Tiefe der Bounding-Box."""
    if not printable_area:
        return None
    xs, ys = [], []
    for pt in printable_area:
        try:
            x, y = pt.split("x")
            xs.append(float(x))
            ys.append(float(y))
        except ValueError:
            return None
    return max(xs) - min(xs), max(ys) - min(ys)


def main() -> int:
    if not PROFILES.is_dir():
        print("Profile fehlen — zuerst ./sync_profiles.sh ausführen", file=sys.stderr)
        return 1

    printers = []
    for vendor_dir in sorted(PROFILES.iterdir()):
        if not (vendor_dir / "machine").is_dir():
            continue
        vendor = vendor_dir.name
        machines = load_vendor_machines(vendor_dir)
        for name, data in sorted(machines.items()):
            if data.get("type") != "machine" or data.get("instantiation") != "true":
                continue
            size = bed_size(resolve(machines, name, "printable_area"))
            if size is None:
                continue
            height = resolve(machines, name, "printable_height")
            nozzle = resolve(machines, name, "nozzle_diameter") or []
            printers.append({
                "vendor": "Bambu Lab" if vendor == "BBL" else vendor,
                "name": name,
                "bed_x": round(size[0], 1),
                "bed_y": round(size[1], 1),
                "height": round(float(height), 1) if height else None,
                "nozzle": float(nozzle[0]) if nozzle else None,
            })

            # Original-Start-/End-G-Code des Druckers als eigene Datei
            start = resolve(machines, name, "machine_start_gcode") or ""
            end = resolve(machines, name, "machine_end_gcode") or ""
            if isinstance(start, list):
                start = "\n".join(start)
            if isinstance(end, list):
                end = "\n".join(end)
            mdir = OUT.parent / "machines"
            mdir.mkdir(parents=True, exist_ok=True)
            (mdir / f"{name}.json").write_text(
                json.dumps({"start_gcode": start, "end_gcode": end},
                           ensure_ascii=False),
                encoding="utf-8")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(printers, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    vendors = sorted({p["vendor"] for p in printers})
    print(f"OK: {len(printers)} Drucker von {len(vendors)} Herstellern → {OUT}")
    print("Hersteller:", ", ".join(vendors))
    return 0


if __name__ == "__main__":
    sys.exit(main())
