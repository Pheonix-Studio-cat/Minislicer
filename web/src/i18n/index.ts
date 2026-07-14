/**
 * Mehrsprachigkeit — dieselben 18 Sprachen wie BambuStudio (resources/i18n):
 * cs, de, en, es, fr, hu, it, ja, ko, nl, pl, pt_BR, ru, sv, tr, uk, zh_CN, zh_TW.
 *
 * Die Übersetzungen liegen als JSON in ./locales/<code>.json; Englisch ist
 * der Fallback für fehlende Schlüssel.
 */

const modules = import.meta.glob<Record<string, string>>("./locales/*.json", {
  eager: true,
  import: "default",
});

const translations: Record<string, Record<string, string>> = {};
for (const [path, dict] of Object.entries(modules)) {
  const code = path.match(/locales\/(.+)\.json$/)![1];
  translations[code] = dict;
}

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "cs", name: "Čeština" },
  { code: "de", name: "Deutsch" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "hu", name: "Magyar" },
  { code: "it", name: "Italiano" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "pt_BR", name: "Português (BR)" },
  { code: "ru", name: "Русский" },
  { code: "sv", name: "Svenska" },
  { code: "tr", name: "Türkçe" },
  { code: "uk", name: "Українська" },
  { code: "zh_CN", name: "简体中文" },
  { code: "zh_TW", name: "繁體中文" },
];

const STORAGE_KEY = "minislicer.lang";

function detectLanguage(): string {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && translations[saved]) return saved;
  const nav = navigator.language.replace("-", "_");
  if (translations[nav]) return nav;
  const short = nav.split("_")[0];
  if (short === "zh") return "zh_CN";
  if (short === "pt") return "pt_BR";
  return translations[short] ? short : "en";
}

export function currentLanguage(): string {
  return detectLanguage();
}

export function setLanguage(code: string): void {
  localStorage.setItem(STORAGE_KEY, code);
}

export function makeT(code: string) {
  const dict = translations[code] ?? {};
  const en = translations.en ?? {};
  return (key: string): string => dict[key] ?? en[key] ?? key;
}
