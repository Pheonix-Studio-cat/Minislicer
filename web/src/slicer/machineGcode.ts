/**
 * Lädt die originalen machine_start_gcode/machine_end_gcode aus den
 * BambuStudio-Maschinenprofilen (profiles/extract_printers.py →
 * public/profiles/machines/<Drucker>.json) und setzt die wichtigsten
 * Platzhalter ein.
 *
 * BambuStudios G-Code-Vorlagen enthalten eine eigene Template-Sprache
 * ([platzhalter], {if …}-Blöcke). Die vollständige Auswertung übernimmt erst
 * der libslic3r-Port (Phase 1); bis dahin: bekannte Platzhalter ersetzen,
 * Zeilen mit nicht auflösbaren Ausdrücken auskommentieren, damit der
 * G-Code gültig bleibt.
 */

export interface MachineGcode {
  start: string;
  end: string;
}

export async function loadMachineGcode(
  printerName: string,
  nozzleTemp: number,
  bedTemp: number
): Promise<MachineGcode> {
  try {
    const url = `${import.meta.env.BASE_URL}profiles/machines/${encodeURIComponent(printerName)}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as { start_gcode: string; end_gcode: string };
    return {
      start: substitute(raw.start_gcode, nozzleTemp, bedTemp),
      end: substitute(raw.end_gcode, nozzleTemp, bedTemp),
    };
  } catch {
    return { start: "", end: "" }; // Engine nutzt dann ihren Standard-Header
  }
}

function substitute(gcode: string, nozzleTemp: number, bedTemp: number): string {
  let out = gcode
    // Temperatur-Platzhalter (alle Varianten der Bambu-Profile)
    .replace(/\[(nozzle_temperature[a-z_0-9\[\]]*)\]/g, String(nozzleTemp))
    .replace(/\[([a-z_]*bed_temperature[a-z_0-9\[\]]*)\]/g, String(bedTemp))
    .replace(/\[(hot_plate_temp[a-z_0-9\[\]]*|cool_plate_temp[a-z_0-9\[\]]*|eng_plate_temp[a-z_0-9\[\]]*|textured_plate_temp[a-z_0-9\[\]]*)\]/g, String(bedTemp))
    .replace(/\[chamber_temperature\]/g, "0");

  // Zeilen mit nicht auflösbaren Template-Ausdrücken auskommentieren
  return out
    .split("\n")
    .map((line) =>
      /[\[{]/.test(line) && !line.trimStart().startsWith(";")
        ? `; [Minislicer] Template-Zeile übersprungen: ${line}`
        : line
    )
    .join("\n");
}
