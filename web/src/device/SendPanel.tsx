import { useState } from "react";

/**
 * Sende-Funktion: lädt den gesliceten G-Code per HTTP zu einem Drucker-Host
 * hoch — OctoPrint (POST /api/files/local) oder Klipper/Moonraker
 * (POST /server/files/upload). Bambu-Drucker im LAN-Modus sprechen MQTT/FTPS,
 * das ein Browser nicht kann; dafür ist eine lokale Bridge geplant.
 */

type HostType = "moonraker" | "octoprint";

interface Props {
  gcode: string | null;
  gcodeName: string;
  t: (key: string) => string;
}

const STORAGE_KEY = "minislicer.sendTarget";

interface Target {
  type: HostType;
  url: string;
  apiKey: string;
}

function savedTarget(): Target {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Target;
  } catch {
    /* Standardwerte verwenden */
  }
  return { type: "moonraker", url: "", apiKey: "" };
}

async function upload(target: Target, gcode: string, name: string): Promise<void> {
  const base = target.url.replace(/\/+$/, "");
  const file = new File([gcode], name, { type: "text/x-gcode" });
  const form = new FormData();
  const headers: Record<string, string> = {};
  if (target.apiKey) headers["X-Api-Key"] = target.apiKey;

  let endpoint: string;
  if (target.type === "octoprint") {
    endpoint = `${base}/api/files/local`;
    form.append("file", file);
  } else {
    endpoint = `${base}/server/files/upload`;
    form.append("file", file);
    form.append("root", "gcodes");
  }

  const res = await fetch(endpoint, { method: "POST", body: form, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export default function SendPanel({ gcode, gcodeName, t }: Props) {
  const [target, setTarget] = useState<Target>(savedTarget());
  const [state, setState] = useState<"idle" | "sending" | "ok" | "fail">("idle");
  const [detail, setDetail] = useState("");

  const update = (patch: Partial<Target>) => {
    const next = { ...target, ...patch };
    setTarget(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const send = async () => {
    if (!gcode) return;
    setState("sending");
    setDetail("");
    try {
      await upload(target, gcode, gcodeName);
      setState("ok");
    } catch (e) {
      setState("fail");
      setDetail(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="device-card">
      <span className="section-title">{t("tab_device")}</span>
      <div className="card">
        <span className="note">{t("device_hint")}</span>
        <div className="row">
          <span className="label">{t("target")}</span>
          <select
            value={target.type}
            onChange={(e) => update({ type: e.target.value as HostType })}
          >
            <option value="moonraker">Klipper / Moonraker</option>
            <option value="octoprint">OctoPrint</option>
          </select>
        </div>
        <div className="row">
          <span className="label">{t("host_url")}</span>
          <input
            type="text"
            placeholder="http://192.168.1.50"
            value={target.url}
            onChange={(e) => update({ url: e.target.value })}
          />
        </div>
        <div className="row">
          <span className="label">{t("api_key")}</span>
          <input
            type="password"
            value={target.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </div>
        <button
          className="primary"
          disabled={!gcode || !target.url || state === "sending"}
          onClick={() => void send()}
        >
          {state === "sending" ? t("sending") : t("send_gcode")}
        </button>
        {!gcode && <span className="warn">{t("no_gcode")}</span>}
        {state === "ok" && <span className="badge">{t("send_ok")}</span>}
        {state === "fail" && (
          <span className="warn">
            {t("send_fail")}: {detail}
          </span>
        )}
        <span className="note">{t("bambu_note")}</span>
      </div>
    </div>
  );
}
