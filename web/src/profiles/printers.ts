/**
 * Drucker-Katalog, generiert aus den originalen BambuStudio-Profilen
 * (profiles/extract_printers.py → public/profiles/printers.json).
 */

export interface Printer {
  vendor: string;
  name: string;
  bed_x: number;
  bed_y: number;
  height: number | null;
  nozzle: number | null;
}

export const DEFAULT_PRINTER_NAME = "Bambu Lab X1 Carbon 0.4 nozzle";
const STORAGE_KEY = "minislicer.printer";

let catalog: Promise<Printer[]> | null = null;

export function loadPrinters(): Promise<Printer[]> {
  if (!catalog) {
    catalog = fetch(`${import.meta.env.BASE_URL}profiles/printers.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`printers.json: HTTP ${r.status}`);
        return r.json() as Promise<Printer[]>;
      })
      .catch(() => []);
  }
  return catalog;
}

export function savedPrinterName(): string {
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PRINTER_NAME;
}

export function rememberPrinter(name: string): void {
  localStorage.setItem(STORAGE_KEY, name);
}
