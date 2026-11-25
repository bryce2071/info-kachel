/**
 * Info-Kachel – frei einstellbare Kacheln für Home-Assistant-Dashboards (mit visuellem Editor).
 *
 * custom:info-kachel       eine Kachel: Kopfzeile (Icon + Titel), großer Hauptwert (Schrift automatisch
 *                          oder fest), beliebig viele Zeilen darunter (Zustand oder Attribut beliebiger
 *                          Entitäten), Ampelfarbe links nach Grenzen oder Zuständen, Aktion beim Antippen.
 *                          In einer Abschnitts-Ansicht ist jede Kachel eine eigene Karte – frei verschiebbar,
 *                          auch in andere Abschnitte („Zeilen“).
 * custom:info-kachel-container  eine Karte mit einer oder mehreren Reihen, jede mit Überschrift und beliebig vielen
 *                          Kacheln (Raster, Spalten automatisch oder fest). Im Editor Kacheln ziehen oder mit den
 *                          Pfeilen verschieben – innerhalb der Reihe und in andere Reihen; kopieren, ausschneiden
 *                          und in einer anderen Karte wieder einfügen.
 *
 * Werte: Zustand oder Attribut (auch verschachtelt, z. B. „transmitter.wechsel_am“). Formate: automatisch,
 * Zahl, Text, Datum, Datum + Uhrzeit, Uhrzeit, relativ („in 3 T 4 h“), Tage bis dahin.
 * Ampel: Grundfarbe + „ab Wert → Farbe“ (Zahlen; bei Datum/Zeit die Tage bis dahin) oder „Zustand → Farbe“.
 *
 * Quelle: https://github.com/bryce2071/info-kachel (MIT-Lizenz)
 */

const IK_VERSION = "1.0.2";
const NB = String.fromCharCode(160); // geschütztes Leerzeichen
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const ZUSTAND = "@zustand";
export const FARBEN = {
  gruen: "var(--success-color, #43a047)",
  orange: "#f0a020",
  rot: "var(--error-color, #db4437)",
  blau: "var(--info-color, #2a78d6)",
  lila: "#8e5bd0",
  grau: "var(--disabled-text-color, #9e9e9e)",
};
const FARB_NAMEN = { gruen: "Grün", orange: "Orange", rot: "Rot", blau: "Blau", lila: "Lila", grau: "Grau" };
const FORMATE = [
  ["auto", "automatisch"],
  ["zahl", "Zahl"],
  ["text", "Text"],
  ["datum", "Datum"],
  ["datum_zeit", "Datum und Uhrzeit"],
  ["zeit", "Uhrzeit"],
  ["relativ", "relativ (in 3 T 4 h)"],
  ["tage", "Tage bis dahin"],
];

// ---------- reine Hilfsfunktionen (ohne DOM, in Node testbar) ----------

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

export function pfadWert(obj, pfad) {
  let v = obj;
  for (const k of String(pfad).split(".")) {
    if (v === null || v === undefined) return undefined;
    v = Array.isArray(v) && /^[0-9]+$/.test(k) ? v[Number(k)] : v[k];
  }
  return v;
}

/** Wert einer Entität: Zustand oder (verschachteltes) Attribut. */
export function wertHolen(hass, entity, attribut) {
  const st = hass && hass.states ? hass.states[entity] : null;
  if (!st) return { fehlt: true, entity };
  if (!attribut) return { wert: st.state, st, attr: null, entity };
  return { wert: pfadWert(st.attributes || {}, attribut), st, attr: attribut, entity };
}

const DATUM_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:[.][0-9]+)?)?(?:Z|[+-][0-9]{2}:?[0-9]{2})?)?$/;

export function istDatum(v) {
  return typeof v === "string" && DATUM_RE.test(v.trim());
}

function nurDatum(v) {
  return typeof v === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v.trim());
}

function zeitstempel(v) {
  if (nurDatum(v)) {
    const [j, m, t] = v.trim().split("-").map(Number);
    return new Date(j, m - 1, t, 12, 0, 0).getTime();
  }
  return Date.parse(v);
}

/** Zahl aus einem Wert; bei Datum/Zeit die Tage bis dahin (negativ = vorbei). */
export function zahlWert(v, jetzt = Date.now()) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;
  if (istDatum(s)) {
    const t = zeitstempel(s);
    return Number.isNaN(t) ? null : (t - jetzt) / 86400000;
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && /^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)(e[+-]?[0-9]+)?$/i.test(s) ? n : null;
}

function teile(ms, tz) {
  const d = new Date(ms);
  try {
    const p = {};
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
    for (const x of f.formatToParts(d)) p[x.type] = x.value;
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    return { j: p.year, m: p.month, t: p.day, h: p.hour === "24" ? "00" : p.hour, min: p.minute, wd };
  } catch (e) {
    return { j: String(d.getFullYear()), m: pad(d.getMonth() + 1), t: pad(d.getDate()), h: pad(d.getHours()), min: pad(d.getMinutes()), wd: d.getDay() };
  }
}

function kalenderTage(ms, jetzt, tz) {
  const a = teile(ms, tz);
  const h = teile(jetzt, tz);
  return Math.round((Date.UTC(+a.j, +a.m - 1, +a.t) - Date.UTC(+h.j, +h.m - 1, +h.t)) / 86400000);
}

function tagName(ms, jetzt, tz) {
  const a = teile(ms, tz);
  const h = teile(jetzt, tz);
  const diff = kalenderTage(ms, jetzt, tz);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === -1) return "gestern";
  return `${WT[a.wd]} ${a.t}.${a.m}.` + (a.j !== h.j ? a.j.slice(2) : "");
}

export function relativText(ms, jetzt) {
  let diff = ms - jetzt;
  const vorbei = diff < 0;
  diff = Math.abs(diff);
  const min = Math.round(diff / 60000);
  const t = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  let s;
  if (t > 0) s = `${t}${NB}T${h ? ` ${h}${NB}h` : ""}`;
  else if (h > 0) s = `${h}${NB}h${min % 60 ? ` ${min % 60}${NB}min` : ""}`;
  else s = `${min}${NB}min`;
  return vorbei ? `vor ${s}` : `in ${s}`;
}

function zahlText(n, nk, sprache) {
  const opt = nk === null || nk === undefined || nk === "" ? { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2 } : { minimumFractionDigits: Number(nk), maximumFractionDigits: Number(nk) };
  try {
    return n.toLocaleString(sprache || "de", opt);
  } catch (e) {
    return String(n);
  }
}

function kurzText(v) {
  if (Array.isArray(v)) return v.map((x) => (x !== null && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (v !== null && typeof v === "object") return Object.entries(v).map(([k, x]) => `${k}: ${x !== null && typeof x === "object" ? JSON.stringify(x) : x}`).join(", ");
  return String(v);
}

/** Text und Einheit eines Werts. opt: format, nachkommastellen, einheit, tz, sprache. */
export function formatiere(hass, roh, opt = {}, jetzt = Date.now()) {
  if (!roh || roh.fehlt) return { text: "–", einheit: "", leer: true };
  const v = roh.wert;
  if (v === null || v === undefined || v === "" || v === "unknown" || v === "unavailable") return { text: "–", einheit: "", leer: true };
  const tz = opt.tz;
  const sprache = opt.sprache || "de";
  const st = roh.st || { attributes: {} };
  const autoEinheit = !roh.attr ? st.attributes.unit_of_measurement || "" : "";
  const einheit = opt.einheit !== undefined && opt.einheit !== null && opt.einheit !== "" ? String(opt.einheit) : autoEinheit;
  let f = opt.format || "auto";
  const datum = istDatum(typeof v === "string" ? v : "") || (!roh.attr && st.attributes.device_class === "timestamp");
  if (f === "auto") {
    if (datum && istDatum(String(v))) f = nurDatum(String(v)) ? "datum" : "datum_zeit";
    // Attribute als Text gespeichert (LOT, Seriennummer, PLZ …) bleiben Text; Zustände sind immer Text
    else if (zahlWert(v) !== null && typeof v !== "boolean" && !(roh.attr && typeof v === "string")) f = "zahl";
    else f = "text";
  }
  if (["datum", "datum_zeit", "zeit", "relativ", "tage"].includes(f)) {
    const ms = typeof v === "number" ? (v > 1e12 ? v : v * 1000) : zeitstempel(String(v));
    if (Number.isNaN(ms)) return { text: kurzText(v), einheit: "" };
    const p = teile(ms, tz);
    if (f === "datum") return { text: tagName(ms, jetzt, tz), einheit: "" };
    if (f === "datum_zeit") return { text: `${tagName(ms, jetzt, tz)} ${p.h}:${p.min}`, einheit: "" };
    if (f === "zeit") return { text: `${p.h}:${p.min}`, einheit: "" };
    if (f === "relativ") return { text: relativText(ms, jetzt), einheit: "" };
    const tage = nurDatum(String(v)) ? kalenderTage(ms, jetzt, tz) : (ms - jetzt) / 86400000;
    const nk = opt.nachkommastellen ?? 0;
    const txt = zahlText(tage, nk, sprache);
    return { text: txt, einheit: einheit || (txt === "1" || txt === "-1" ? "Tag" : "Tage") };
  }
  if (f === "zahl") {
    const n = zahlWert(v);
    if (n === null || typeof v === "boolean") return { text: kurzText(v), einheit: "" };
    let nk = opt.nachkommastellen;
    if ((nk === undefined || nk === null || nk === "") && !roh.attr && hass && hass.entities && hass.entities[roh.entity]) {
      const dp = hass.entities[roh.entity].display_precision;
      if (Number.isInteger(dp)) nk = dp;
    }
    return { text: zahlText(n, nk, sprache), einheit };
  }
  // Text: Zustände wie HA anzeigen (übersetzt), sonst roh
  if (!roh.attr && hass && typeof hass.formatEntityState === "function" && typeof v === "string") {
    try {
      const t = hass.formatEntityState(st);
      if (t && !einheit) return { text: t, einheit: "" };
    } catch (e) {
      /* egal */
    }
  }
  if (roh.attr && hass && typeof hass.formatEntityAttributeValue === "function" && !roh.attr.includes(".") && (typeof v === "string" || typeof v === "number")) {
    try {
      const t = hass.formatEntityAttributeValue(st, roh.attr);
      if (t !== undefined && t !== null && t !== "") return { text: String(t), einheit: "" };
    } catch (e) {
      /* egal */
    }
  }
  if (typeof v === "boolean") return { text: v ? "ja" : "nein", einheit: "" };
  return { text: kurzText(v), einheit };
}

/** CSS-Farbe aus Name oder eigener Angabe. */
export function farbeCss(f) {
  if (!f) return null;
  const t = String(f).trim();
  if (FARBEN[t]) return FARBEN[t];
  // eigene Farbe: #rrggbb, rgb(…), hsl(…), var(--…) – nur harmlose Zeichen
  return /^(#[0-9a-f]{3,8}|rgba?[(]|hsla?[(]|var[(])/i.test(t) && /^[#a-z0-9(),.% -]+$/i.test(t) ? t : null;
}

/** Ampelfarbe (CSS) einer Kachel oder null. */
export function ampelFarbe(cfg, hass, hauptRoh, jetzt = Date.now()) {
  const a = (cfg && cfg.ampel) || {};
  if (!a.modus || a.modus === "aus") return null;
  // eigene Entität, sonst ein Attribut der Kachel-Entität, sonst der Hauptwert
  const roh = a.entity ? wertHolen(hass, a.entity, a.attribut) : a.attribut ? wertHolen(hass, cfg.entity, a.attribut) : hauptRoh;
  if (!roh || roh.fehlt) return null;
  if (a.modus === "zustaende") {
    const w = String(roh.wert ?? "").trim().toLowerCase();
    const anzeige = formatiere(hass, roh, {}, jetzt).text.trim().toLowerCase();
    const z = (a.zustaende || []).find((x) => {
      const s = String(x.wert ?? "").trim().toLowerCase();
      return s !== "" && (s === w || s === anzeige);
    });
    return farbeCss(z ? z.farbe : a.sonst);
  }
  const x = zahlWert(roh.wert, jetzt);
  if (x === null) return farbeCss(a.sonst);
  let farbe = a.grund;
  const grenzen = (a.grenzen || []).filter((g) => g && g.ab !== "" && g.ab !== null && g.ab !== undefined && Number.isFinite(Number(g.ab)))
    .sort((p, q) => Number(p.ab) - Number(q.ab));
  for (const g of grenzen) if (x >= Number(g.ab)) farbe = g.farbe;
  return farbeCss(farbe);
}

function standardTitel(hass, cfg) {
  if (cfg.titel) return cfg.titel;
  const st = cfg.entity && hass && hass.states ? hass.states[cfg.entity] : null;
  if (!st) return cfg.entity || "Kachel";
  const name = st.attributes.friendly_name || cfg.entity;
  if (cfg.attribut && !cfg.titel) {
    const letzter = String(cfg.attribut).split(".").pop().replace(/_/g, " ");
    return `${name} · ${letzter}`;
  }
  return name;
}

function standardIcon(hass, cfg) {
  if (cfg.icon) return cfg.icon;
  const st = cfg.entity && hass && hass.states ? hass.states[cfg.entity] : null;
  return (st && st.attributes.icon) || "mdi:information-outline";
}

function optionen(hass, x, tz) {
  return { format: x.format, nachkommastellen: x.nachkommastellen, einheit: x.einheit, tz, sprache: (hass && hass.locale && hass.locale.language) || "de" };
}

/** HTML einer Kachel (ohne Rahmen). innen = Kachel im Container (grauer Hintergrund). */
export function kachelHtml(cfg, hass, jetzt = Date.now(), innen = false, index = 0, reihe = 0) {
  const tz = hass && hass.config ? hass.config.time_zone : undefined;
  const haupt = cfg.entity ? wertHolen(hass, cfg.entity, cfg.attribut) : { fehlt: true };
  const hw = cfg.entity ? formatiere(hass, haupt, optionen(hass, cfg, tz), jetzt) : { text: "–", einheit: "", leer: true };
  const farbe = ampelFarbe(cfg, hass, haupt, jetzt);
  const zeilen = (cfg.zeilen || []).map((z) => {
    let text;
    let einheit = "";
    if (z.text !== undefined && z.text !== null && z.text !== "" && !z.entity && !z.attribut) {
      text = String(z.text);
    } else {
      const roh = wertHolen(hass, z.entity || cfg.entity, z.attribut);
      const w = formatiere(hass, roh, optionen(hass, z, tz), jetzt);
      text = w.text;
      einheit = w.einheit;
    }
    return `<div class="zl">${z.label ? `<span class="zlab">${esc(z.label)}</span> ` : ""}<span class="zw">${esc(text)}${einheit ? NB + esc(einheit) : ""}</span></div>`;
  }).join("");
  const px = cfg.schrift && cfg.schrift !== "auto" && Number(cfg.schrift) > 0 ? Number(cfg.schrift) : null;
  const fehlt = cfg.entity && haupt.fehlt;
  const breite = innen && Number(cfg.breite) > 1 ? Math.min(6, Math.round(Number(cfg.breite))) : 0;
  const klickbar = cfg.aktion !== "keine" && (cfg.aktion === "seite" ? !!cfg.pfad : !!cfg.entity);
  const stil = (farbe ? `--ik-farbe:${farbe};` : "") + (breite ? `grid-column:span ${breite};` : "");
  return `<div class="ik${innen ? " innen" : ""}${farbe ? " farbig" : ""}${klickbar ? " klickbar" : ""}" data-r="${reihe}" data-i="${index}"${stil ? ` style="${stil}"` : ""}${klickbar ? ` role="button" tabindex="0"` : ""}>
  <div class="kopf"><ha-icon icon="${esc(standardIcon(hass, cfg))}"></ha-icon><span class="titel">${esc(standardTitel(hass, cfg))}</span></div>
  ${cfg.entity ? `<div class="haupt${px ? " fest" : " auto"}"${px ? ` style="font-size:${px}px"` : ""}><span class="wert">${esc(fehlt ? "?" : hw.text)}</span>${hw.einheit && !fehlt ? `<span class="einheit">${esc(hw.einheit)}</span>` : ""}</div>` : ""}
  ${zeilen ? `<div class="zeilen">${zeilen}</div>` : ""}
  ${fehlt ? `<div class="zl warn">Entität ${esc(cfg.entity)} fehlt</div>` : ""}
</div>`;
}

/** Reihen des Containers; Kurzform „kacheln:“ ohne Reihen = eine Reihe. */
export function reihenVon(cfg) {
  if (cfg && Array.isArray(cfg.reihen)) {
    return cfg.reihen.filter((r) => r && typeof r === "object").map((r) => ({ ...r, kacheln: Array.isArray(r.kacheln) ? r.kacheln : [] }));
  }
  if (cfg && Array.isArray(cfg.kacheln)) return [{ kacheln: cfg.kacheln }];
  return [];
}

/** Alle Attribute einer Entität (verschachtelt als Pfad) mit Vorschau – für die Auswahl im Editor. */
export function attributListe(st, tiefe = 3) {
  const aus = [];
  const geh = (obj, praefix, t) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const pfad = praefix ? `${praefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v) && t > 1 && Object.keys(v).length && Object.keys(v).length <= 40) {
        aus.push({ pfad, vorschau: "{…}" });
        geh(v, pfad, t - 1);
      } else {
        let s = Array.isArray(v) ? `[${v.length}]` : v === null ? "–" : String(v);
        if (s.length > 40) s = s.slice(0, 39) + "…";
        aus.push({ pfad, vorschau: s });
      }
    }
  };
  if (st) geh(st.attributes, "", tiefe);
  return aus;
}

/** Konfiguration aufräumen: leere Werte weg, damit das YAML übersichtlich bleibt. */
export function sauber(o) {
  if (Array.isArray(o)) return o.map(sauber);
  if (o && typeof o === "object") {
    const aus = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === null || v === "") continue;
      const s = sauber(v);
      if (Array.isArray(s) && !s.length && k !== "kacheln") continue;
      if (s && typeof s === "object" && !Array.isArray(s) && !Object.keys(s).length) continue;
      aus[k] = s;
    }
    return aus;
  }
  return o;
}

// ---------- CSS ----------

const KACHEL_CSS = `
:host { display: block; }
.ik { box-sizing: border-box; position: relative; display: flex; flex-direction: column; gap: 1px; min-width: 0; height: 100%;
  border-radius: var(--ha-card-border-radius, 12px); padding: 9px 11px; overflow: hidden; color: var(--primary-text-color);
  border-left: 4px solid var(--ik-farbe, transparent); }
.ik.innen { border-radius: 12px; background: var(--secondary-background-color, rgba(127,127,127,.08)); }
.ik.klickbar { cursor: pointer; }
.ik:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
.kopf { display: flex; align-items: center; gap: 6px; font-size: .84em; color: var(--secondary-text-color); min-width: 0; margin-bottom: 2px; }
.kopf ha-icon { --mdc-icon-size: 18px; flex: none; }
.titel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.haupt { display: flex; align-items: baseline; gap: 5px; white-space: nowrap; overflow: hidden; line-height: 1.15; min-width: 0; }
.haupt.auto { font-size: 1.6em; }
.wert { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.einheit { font-size: .55em; color: var(--secondary-text-color); font-weight: 400; flex: none; }
.zeilen { display: flex; flex-direction: column; gap: 1px; margin-top: 3px; min-width: 0; }
.zl { font-size: .76em; color: var(--secondary-text-color); line-height: 1.3; overflow: hidden; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.zl .zw { color: var(--primary-text-color); }
.zl.warn { color: var(--error-color, #db4437); }
`;

const KARTE_CSS = `
ha-card { height: 100%; overflow: hidden; }
`;

const CONTAINER_CSS = `
ha-card { padding: 10px 12px 12px; }
.karten-titel { display: flex; align-items: center; gap: 8px; font-size: 1.1em; font-weight: 500; margin: 2px 2px 10px; }
.karten-titel ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
.reihe + .reihe { margin-top: 12px; }
.reihen-kopf { display: flex; align-items: center; gap: 6px; font-size: .9em; font-weight: 500; color: var(--secondary-text-color); margin: 2px 2px 6px; min-width: 0; }
.reihen-kopf span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reihen-kopf ha-icon { --mdc-icon-size: 18px; flex: none; }
.raster { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(min(var(--ik-min, 140px), 100%), 1fr)); }
.raster.strecken { grid-template-columns: repeat(auto-fit, minmax(min(var(--ik-min, 140px), 100%), 1fr)); }
.raster.fest { grid-template-columns: repeat(var(--ik-spalten), minmax(0, 1fr)); }
.ik.innen { min-height: var(--ik-hoehe, 0); }
.leer { color: var(--secondary-text-color); padding: 10px; text-align: center; font-size: .85em; grid-column: 1 / -1; }
`;

// Hauptwert so groß wie möglich, ohne abgeschnitten zu werden (Schrift „automatisch“)
function schriftAnpassen(wurzel) {
  for (const h of wurzel.querySelectorAll(".haupt.auto")) {
    h.style.fontSize = "";
    const w = h.querySelector(".wert");
    const zuBreit = () => h.scrollWidth > h.clientWidth + 1 || (w && w.scrollWidth > w.clientWidth + 1);
    const basis = parseFloat(getComputedStyle(h).fontSize) || 24;
    let gr = basis;
    let n = 0;
    while (zuBreit() && gr > 11 && n < 40) {
      gr -= 1;
      h.style.fontSize = gr + "px";
      n++;
    }
  }
}

function aktionAusfuehren(el, cfg) {
  const a = cfg.aktion || "mehr";
  if (a === "keine") return;
  if (a === "seite" && cfg.pfad) {
    if (/^https?:/i.test(cfg.pfad)) {
      window.open(cfg.pfad, "_blank", "noopener");
      return;
    }
    history.pushState(null, "", cfg.pfad);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    return;
  }
  const ent = cfg.entity;
  if (ent) el.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: ent } }));
}

function relevanteEntitaeten(cfgs) {
  const s = new Set();
  for (const c of cfgs) {
    if (c.entity) s.add(c.entity);
    for (const z of c.zeilen || []) if (z.entity) s.add(z.entity);
    if (c.ampel && c.ampel.entity) s.add(c.ampel.entity);
  }
  return [...s];
}

// ---------- Karten ----------

if (typeof HTMLElement !== "undefined" && typeof customElements !== "undefined") {
  class IkBasis extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._html = "";
      this.shadowRoot.addEventListener("click", (e) => this._klick(e));
      this.shadowRoot.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target && e.target.classList && e.target.classList.contains("klickbar")) {
          e.preventDefault();
          this._klick(e);
        }
      });
    }

    set hass(h) {
      const alt = this._hass;
      this._hass = h;
      if (!this._cfg) return;
      // nur neu zeichnen, wenn sich eine beteiligte Entität geändert hat
      if (alt && this._ents && this._ents.every((e) => alt.states[e] === h.states[e])) return;
      this._zeichnen();
    }

    connectedCallback() {
      clearInterval(this._uhr);
      // relative Zeiten (in 3 h …) aktuell halten
      this._uhr = setInterval(() => this._zeichnen(), 60000);
      if (!this._ro && typeof ResizeObserver !== "undefined") {
        this._ro = new ResizeObserver(() => schriftAnpassen(this.shadowRoot));
        this._ro.observe(this);
      }
      this._zeichnen();
    }

    disconnectedCallback() {
      clearInterval(this._uhr);
      if (this._ro) {
        this._ro.disconnect();
        this._ro = null;
      }
    }

    _zeichnen() {
      if (!this._cfg || !this._hass) return;
      const html = this._inhalt();
      if (html !== this._html) {
        this._html = html;
        this.shadowRoot.innerHTML = html;
      }
      schriftAnpassen(this.shadowRoot);
    }
  }

  class InfoKachel extends IkBasis {
    static getConfigElement() {
      return document.createElement("info-kachel-editor");
    }

    static getStubConfig(hass) {
      const ents = Object.keys((hass && hass.states) || {});
      const e = ents.find((x) => x.startsWith("sensor.") && hass.states[x].attributes.unit_of_measurement) || ents.find((x) => x.startsWith("sensor.")) || "";
      return { entity: e };
    }

    setConfig(cfg) {
      if (!cfg || typeof cfg !== "object") throw new Error("Ungültige Konfiguration");
      this._cfg = { ...cfg };
      this._ents = relevanteEntitaeten([this._cfg]);
      this._html = "";
      this._zeichnen();
    }

    getCardSize() {
      return 2 + Math.ceil(((this._cfg && this._cfg.zeilen) || []).length / 3);
    }

    getGridOptions() {
      return { columns: 4, min_columns: 3, rows: "auto" };
    }

    _inhalt() {
      return `<style>${KACHEL_CSS}${KARTE_CSS}</style><ha-card>${kachelHtml(this._cfg, this._hass, Date.now(), false, 0)}</ha-card>`;
    }

    _klick(e) {
      const el = e.composedPath().find((x) => x && x.classList && x.classList.contains("klickbar"));
      if (el) aktionAusfuehren(this, this._cfg);
    }
  }

  class InfoKachelContainer extends IkBasis {
    static getConfigElement() {
      return document.createElement("info-kachel-container-editor");
    }

    static getStubConfig(hass) {
      return { reihen: [{ titel: "Überschrift", kacheln: [InfoKachel.getStubConfig(hass)] }] };
    }

    setConfig(cfg) {
      if (!cfg || typeof cfg !== "object") throw new Error("Ungültige Konfiguration");
      this._cfg = { ...cfg };
      this._reihen = reihenVon(cfg);
      this._ents = relevanteEntitaeten(this._reihen.flatMap((r) => r.kacheln));
      this._html = "";
      this._zeichnen();
    }

    getCardSize() {
      const r = this._reihen || [];
      return Math.max(2, r.reduce((s, x) => s + 1 + 2 * Math.max(1, Math.ceil(x.kacheln.length / 3)), 0));
    }

    getGridOptions() {
      return { columns: 12, min_columns: 4, rows: "auto" };
    }

    _inhalt() {
      const c = this._cfg;
      const sp = Number(c.spalten) > 0 ? Math.round(Number(c.spalten)) : 0;
      const min = Number(c.min_breite) > 0 ? Number(c.min_breite) : 140;
      const hoehe = Number(c.min_hoehe) > 0 ? Number(c.min_hoehe) : 0;
      const stil = `--ik-min:${min}px;${sp ? `--ik-spalten:${sp};` : ""}${hoehe ? `--ik-hoehe:${hoehe}px;` : ""}`;
      const klasse = sp ? " fest" : c.strecken ? " strecken" : "";
      const jetzt = Date.now();
      const reihen = this._reihen.map((r, ri) => {
        const kopf = r.titel || r.icon ? `<div class="reihen-kopf">${r.icon ? `<ha-icon icon="${esc(r.icon)}"></ha-icon>` : ""}<span>${esc(r.titel || "")}</span></div>` : "";
        const kacheln = r.kacheln.map((k, i) => kachelHtml(k, this._hass, jetzt, true, i, ri)).join("");
        return `<div class="reihe">${kopf}<div class="raster${klasse}" style="${stil}">${kacheln || `<div class="leer">keine Kacheln</div>`}</div></div>`;
      }).join("");
      const titel = c.titel ? `<div class="karten-titel">${c.icon ? `<ha-icon icon="${esc(c.icon)}"></ha-icon>` : ""}<span>${esc(c.titel)}</span></div>` : "";
      return `<style>${KACHEL_CSS}${CONTAINER_CSS}</style><ha-card>${titel}${reihen || `<div class="leer">Noch keine Kacheln – im Editor hinzufügen.</div>`}</ha-card>`;
    }

    _klick(e) {
      const el = e.composedPath().find((x) => x && x.classList && x.classList.contains("klickbar"));
      if (!el) return;
      const r = this._reihen[Number(el.dataset.r)];
      const k = r && r.kacheln[Number(el.dataset.i)];
      if (k) aktionAusfuehren(this, k);
    }
  }

  if (!customElements.get("info-kachel")) customElements.define("info-kachel", InfoKachel);
  if (!customElements.get("info-kachel-container")) customElements.define("info-kachel-container", InfoKachelContainer);

  // ---------- Editoren ----------

  const LABEL = {
    titel: "Titel", icon: "Icon", entity: "Entität", attribut: "Wert", format: "Format", nachkommastellen: "Nachkommastellen",
    einheit: "Einheit", schrift_modus: "Schriftgröße", schrift_px: "Größe (px)", label: "Beschriftung", text: "fester Text",
    modus: "Ampel", grund: "Grundfarbe", ab: "ab", farbe: "Farbe", wert: "Zustand", sonst: "sonst", aktion: "Beim Antippen",
    pfad: "Seite oder Adresse", spalten: "Spalten", breite: "Breite in der Reihe", min_breite: "Mindestbreite je Kachel (px)",
  };
  const HILFE = {
    titel: "leer = Name der Entität",
    icon: "leer = Icon der Entität",
    einheit: "leer = automatisch",
    nachkommastellen: "leer = automatisch",
    pfad: "z. B. /dashboard-diabetes/diabetes oder https://…",
    spalten: "automatisch = so viele, wie nebeneinander passen",
  };
  const HILFE_ZEILE = { entity: "leer = Entität der Kachel", text: "fester Text statt eines Werts (nur ohne Entität und Wert)" };
  const HILFE_AMPEL = { entity: "leer = Wert der Kachel" };
  const LABEL_KARTE = { titel: "Titel der Karte", min_hoehe: "Mindesthöhe je Kachel (px)", strecken: "Kacheln auf die ganze Breite strecken" };
  const HILFE_KARTE = { titel: "optional, über allen Reihen", spalten: "automatisch = so viele, wie nebeneinander passen", icon: "" };
  const LABEL_REIHE = { titel: "Überschrift" };

  // HA lädt seine Formular-Bausteine (ha-form, Auswahlfelder, Sortierhilfe) erst mit einem Editor –
  // einmal den Editor der Entitäten-Karte laden, dann sind sie da.
  let ladenVersprechen = null;
  function haFormLaden() {
    if (!ladenVersprechen) {
      ladenVersprechen = (async () => {
        try {
          if (window.loadCardHelpers) {
            const helpers = await window.loadCardHelpers();
            const c = await helpers.createCardElement({ type: "entities", entities: [] });
            if (c && c.constructor && c.constructor.getConfigElement) await c.constructor.getConfigElement();
          }
        } catch (e) {
          /* egal – ha-form kommt dann mit dem Editor */
        }
      })();
    }
    return ladenVersprechen.then(() => customElements.whenDefined("ha-form"));
  }

  function formular(hass, schema, data, onChange, hilfe = HILFE, labels = LABEL) {
    const f = document.createElement("ha-form");
    f.computeLabel = (s) => labels[s.name] ?? LABEL[s.name] ?? s.name;
    f.computeHelper = (s) => hilfe[s.name];
    f.hass = hass;
    setzeSchema(f, schema);
    setzeDaten(f, data);
    f.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      onChange({ ...e.detail.value });
    });
    return f;
  }

  function setzeSchema(f, schema) {
    const j = JSON.stringify(schema);
    if (f._ikSchema === j) return;
    f._ikSchema = j;
    f.schema = schema;
  }

  function setzeDaten(f, data) {
    if (f.data && JSON.stringify(f.data) === JSON.stringify(data)) return;
    f.data = data;
  }

  function knopf(icon, titel, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kn" + (cls ? " " + cls : "");
    b.title = titel;
    b.setAttribute("aria-label", titel);
    b.innerHTML = `<ha-icon icon="${icon}"></ha-icon>`;
    return b;
  }

  function textKnopf(icon, text) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tk";
    b.innerHTML = `<ha-icon icon="${icon}"></ha-icon><span>${esc(text)}</span>`;
    return b;
  }

  function attributOptionen(hass, entity, aktuell, zustandText) {
    const st = entity && hass ? hass.states[entity] : null;
    const opts = [{ value: ZUSTAND, label: zustandText || (st ? `Zustand · ${String(st.state).slice(0, 30)}${st.attributes.unit_of_measurement ? " " + st.attributes.unit_of_measurement : ""}` : "Zustand") }];
    for (const a of attributListe(st)) opts.push({ value: a.pfad, label: `${a.pfad} · ${a.vorschau}` });
    if (aktuell && !opts.some((o) => o.value === aktuell)) opts.push({ value: aktuell, label: aktuell });
    return opts;
  }

  const FORMAT_OPT = FORMATE.map(([value, label]) => ({ value, label }));
  const FARB_OPT = Object.entries(FARB_NAMEN).map(([value, label]) => ({ value, label }));

  const EDITOR_CSS = `
:host { display: block; }
.ed { display: flex; flex-direction: column; gap: 6px; }
h3 { margin: 14px 0 2px; font-size: 1em; font-weight: 500; color: var(--primary-color); display: flex; align-items: center; gap: 8px; }
h3:first-child { margin-top: 2px; }
.hinweis { font-size: .85em; color: var(--secondary-text-color); margin: 0 2px 4px; line-height: 1.4; }
.vorschau { font-size: .85em; color: var(--secondary-text-color); margin: 2px 2px 0; }
.vorschau b { color: var(--primary-text-color); font-weight: 500; }
.liste { display: flex; flex-direction: column; gap: 8px; }
.eintrag { border: 1px solid var(--divider-color, rgba(127,127,127,.3)); border-radius: 10px; padding: 8px 8px 4px; position: relative; }
.eintrag .leiste { display: flex; gap: 2px; justify-content: flex-end; align-items: center; margin-bottom: 2px; }
.eintrag .leiste .nr { flex: 1; font-size: .85em; color: var(--secondary-text-color); }
.reihe { display: flex; gap: 6px; align-items: flex-start; }
.reihe > ha-form { flex: 1; }
.kn { border: 0; background: none; color: var(--secondary-text-color); padding: 4px; border-radius: 50%; cursor: pointer; display: inline-flex; }
.kn:hover { background: rgba(127,127,127,.15); }
.kn[disabled] { opacity: .35; cursor: default; background: none; }
.kn.rot { color: var(--error-color, #db4437); }
.kn ha-icon { --mdc-icon-size: 20px; }
.tk { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--divider-color, rgba(127,127,127,.3));
  border-radius: 18px; padding: 5px 12px 5px 8px; background: none; color: var(--primary-color); font: inherit; font-size: .92em; cursor: pointer; }
.tk ha-icon { --mdc-icon-size: 18px; }
.tk[disabled] { opacity: .45; cursor: default; }
.knoepfe { display: flex; gap: 8px; flex-wrap: wrap; }
.kachel-kopf { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 0 4px; }
.kachel-kopf .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.kachel-kopf .name small { color: var(--secondary-text-color); font-weight: 400; margin-left: 6px; }
.kachel-kopf .pfeil { transition: transform .15s; color: var(--secondary-text-color); display: inline-flex; }
.eintrag.offen .kachel-kopf .pfeil { transform: rotate(90deg); }
.farbpunkt { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--divider-color); }
.kliste:empty { min-height: 30px; border: 1px dashed var(--divider-color, rgba(127,127,127,.3)); border-radius: 8px; }
.reihe-box { padding: 8px 8px 10px; background: rgba(127,127,127,.04); }
.reihe-box .knoepfe { margin-top: 8px; }
.griff { cursor: grab; color: var(--secondary-text-color); display: inline-flex; touch-action: none; }
.griff ha-icon { --mdc-icon-size: 20px; }
`;

  class InfoKachelEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._cfg = {};
      this._formen = {};
      this._struktur = "";
    }

    set hass(h) {
      this._hass = h;
      for (const f of this.shadowRoot.querySelectorAll("ha-form")) f.hass = h;
      this._vorschau();
    }

    /** eingebettet: im Zeilen-Editor; dann statt config-changed ein eigenes Ereignis */
    set eingebettet(v) {
      this._eingebettet = !!v;
    }

    setConfig(cfg) {
      this._cfg = { ...(cfg || {}) };
      this._aufbauen();
    }

    connectedCallback() {
      haFormLaden().then(() => this._aufbauen(true));
    }

    _senden() {
      const neu = sauber(this._cfg);
      if (this._eingebettet) {
        this.dispatchEvent(new CustomEvent("kachel-geaendert", { detail: { config: neu } }));
      } else {
        this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: neu } }));
      }
    }

    _aendern(neu, umbauen) {
      this._cfg = neu;
      this._senden();
      this._aufbauen(umbauen);
    }

    // Struktur nur bei Änderungen der Listen neu aufbauen (sonst nur Daten setzen → Eingabefokus bleibt)
    _strukturSchluessel() {
      const c = this._cfg;
      const a = c.ampel || {};
      return JSON.stringify([
        (c.zeilen || []).length, a.modus || "aus", (a.grenzen || []).length, (a.zustaende || []).length,
        c.aktion || "mehr", c.schrift && c.schrift !== "auto" ? "px" : "auto", !!customElements.get("ha-form"), !!this._eingebettet,
      ]);
    }

    _aufbauen(erzwingen) {
      if (!this._hass && !erzwingen) return;
      const schluessel = this._strukturSchluessel();
      if (!erzwingen && schluessel === this._struktur && this.shadowRoot.querySelector(".ed")) {
        this._datenSetzen();
        this._vorschau();
        return;
      }
      this._struktur = schluessel;
      const r = this.shadowRoot;
      r.innerHTML = `<style>${EDITOR_CSS}</style><div class="ed"></div>`;
      const ed = r.querySelector(".ed");
      if (!customElements.get("ha-form")) {
        ed.innerHTML = `<div class="hinweis">Editor wird geladen …</div>`;
        return;
      }
      const c = this._cfg;
      this._formen = {};
      const h = (t) => {
        const el = document.createElement("h3");
        el.textContent = t;
        ed.appendChild(el);
        return el;
      };

      // Kopfzeile
      h("Kopfzeile");
      this._formen.kopf = formular(this._hass, this._kopfSchema(), {}, (v) => this._aendern({ ...this._cfg, titel: v.titel, icon: v.icon,
        breite: this._eingebettet && v.breite && v.breite !== "1" ? Number(v.breite) : undefined }));
      this._formen.kopf.dataset.form = "kopf";
      ed.appendChild(this._formen.kopf);

      // Hauptwert
      h("Hauptwert (groß)");
      this._formen.haupt = formular(this._hass, this._hauptSchema(), {}, (v) => {
        const neu = { ...this._cfg, entity: v.entity, attribut: v.attribut && v.attribut !== ZUSTAND ? v.attribut : undefined, format: v.format === "auto" ? undefined : v.format,
          nachkommastellen: v.nachkommastellen, einheit: v.einheit,
          schrift: v.schrift_modus === "px" ? Number(v.schrift_px) || 28 : undefined };
        const entWechsel = (v.entity || "") !== (this._cfg.entity || "");
        if (entWechsel) neu.attribut = undefined;
        this._aendern(neu, entWechsel);
      });
      this._formen.haupt.dataset.form = "haupt";
      ed.appendChild(this._formen.haupt);
      const vs = document.createElement("div");
      vs.className = "vorschau";
      vs.dataset.v = "haupt";
      ed.appendChild(vs);

      // Zeilen
      h("Zeilen darunter");
      const liste = document.createElement("div");
      liste.className = "liste";
      ed.appendChild(liste);
      (c.zeilen || []).forEach((z, i) => liste.appendChild(this._zeileEintrag(z, i)));
      const plus = textKnopf("mdi:plus", "Zeile hinzufügen");
      plus.addEventListener("click", () => this._aendern({ ...this._cfg, zeilen: [...(this._cfg.zeilen || []), {}] }, true));
      ed.appendChild(plus);
      if (!(c.zeilen || []).length) {
        const hn = document.createElement("div");
        hn.className = "hinweis";
        hn.textContent = "Zeilen zeigen weitere Werte – den Zustand oder ein Attribut dieser oder einer anderen Entität, mit Beschriftung.";
        ed.insertBefore(hn, plus);
      }

      // Ampel
      h("Ampel (Farbe links)");
      const a = c.ampel || {};
      this._formen.ampel = formular(this._hass, this._ampelSchema(), {}, (v) => {
        const am = { ...(this._cfg.ampel || {}), modus: v.modus, entity: v.entity || undefined, attribut: v.attribut && v.attribut !== ZUSTAND ? v.attribut : undefined,
          grund: v.grund, sonst: v.sonst };
        if (am.entity !== (this._cfg.ampel || {}).entity) am.attribut = undefined;
        if (am.modus === "grenzen" && !(am.grenzen || []).length) am.grenzen = [{ ab: "", farbe: "orange" }];
        if (am.modus === "zustaende" && !(am.zustaende || []).length) am.zustaende = [{ wert: "", farbe: "gruen" }];
        const umbau = am.modus !== ((this._cfg.ampel || {}).modus || "aus") || am.entity !== (this._cfg.ampel || {}).entity;
        this._aendern({ ...this._cfg, ampel: am.modus === "aus" ? undefined : am }, umbau);
      }, HILFE_AMPEL);
      this._formen.ampel.dataset.form = "ampel";
      ed.appendChild(this._formen.ampel);
      if (a.modus === "grenzen" || a.modus === "zustaende") {
        const gl = document.createElement("div");
        gl.className = "liste";
        ed.appendChild(gl);
        const feld = a.modus === "grenzen" ? "grenzen" : "zustaende";
        (a[feld] || []).forEach((g, i) => gl.appendChild(this._ampelEintrag(feld, g, i)));
        const p2 = textKnopf("mdi:plus", a.modus === "grenzen" ? "Grenze hinzufügen" : "Zustand hinzufügen");
        p2.addEventListener("click", () => {
          const am = { ...(this._cfg.ampel || {}) };
          am[feld] = [...(am[feld] || []), feld === "grenzen" ? { ab: "", farbe: "gruen" } : { wert: "", farbe: "rot" }];
          this._aendern({ ...this._cfg, ampel: am }, true);
        });
        ed.appendChild(p2);
        const hn = document.createElement("div");
        hn.className = "hinweis";
        hn.textContent = a.modus === "grenzen"
          ? "Die Farbe gilt ab dem Wert bis zur nächsten Grenze, darunter die Grundfarbe. Bei Datum/Uhrzeit zählen die Tage bis dahin (vorbei = negativ, 0,5 = 12 Stunden)."
          : "Groß-/Kleinschreibung egal; für alle anderen Zustände gilt „sonst“.";
        ed.appendChild(hn);
      }
      const va = document.createElement("div");
      va.className = "vorschau";
      va.dataset.v = "ampel";
      ed.appendChild(va);

      // Aktion
      h("Beim Antippen");
      this._formen.aktion = formular(this._hass, this._aktionSchema(), {}, (v) => {
        const umbau = (v.aktion || "mehr") !== (this._cfg.aktion || "mehr");
        this._aendern({ ...this._cfg, aktion: v.aktion === "mehr" ? undefined : v.aktion, pfad: v.aktion === "seite" ? v.pfad : undefined }, umbau);
      });
      this._formen.aktion.dataset.form = "aktion";
      ed.appendChild(this._formen.aktion);
      const fuss = document.createElement("div");
      fuss.className = "hinweis";
      fuss.textContent = `Info-Kachel ${IK_VERSION}`;
      ed.appendChild(fuss);
      this._datenSetzen();
      this._vorschau();
    }

    _kopfSchema() {
      const s = [{ type: "grid", name: "", schema: [{ name: "titel", selector: { text: {} } }, { name: "icon", selector: { icon: {} } }] }];
      if (this._eingebettet) {
        s.push({ name: "breite", selector: { select: { options: [1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 1 ? "1 Spalte" : `${n} Spalten` })), mode: "dropdown" } } });
      }
      return s;
    }

    _hauptSchema() {
      const c = this._cfg;
      const s = [
        { name: "entity", selector: { entity: {} } },
        { name: "attribut", selector: { select: { options: attributOptionen(this._hass, c.entity, c.attribut), mode: "dropdown", custom_value: true } } },
        { type: "grid", name: "", schema: [
          { name: "format", selector: { select: { options: FORMAT_OPT, mode: "dropdown" } } },
          { name: "einheit", selector: { text: {} } },
        ] },
        { type: "grid", name: "", schema: [
          { name: "nachkommastellen", selector: { number: { min: 0, max: 6, step: 1, mode: "box" } } },
          { name: "schrift_modus", selector: { select: { options: [{ value: "auto", label: "automatisch (passt sich an)" }, { value: "px", label: "fest" }], mode: "dropdown" } } },
        ] },
      ];
      if (c.schrift && c.schrift !== "auto") s.push({ name: "schrift_px", selector: { number: { min: 10, max: 96, step: 1, mode: "slider" } } });
      return s;
    }

    _ampelSchema() {
      const a = this._cfg.ampel || {};
      const s = [{ name: "modus", selector: { select: { options: [{ value: "aus", label: "aus" }, { value: "grenzen", label: "nach Grenzen (Zahl, Datum)" }, { value: "zustaende", label: "nach Zustand (Text)" }], mode: "dropdown" } } }];
      if (a.modus === "grenzen" || a.modus === "zustaende") {
        s.push({ name: "entity", selector: { entity: {} } });
        const ent = a.entity || this._cfg.entity;
        if (ent) s.push({ name: "attribut", selector: { select: { options: attributOptionen(this._hass, ent, a.attribut, a.entity ? "" : "wie der Hauptwert"), mode: "dropdown", custom_value: true } } });
        s.push({ name: a.modus === "grenzen" ? "grund" : "sonst", selector: { select: { options: [{ value: "", label: "keine" }, ...FARB_OPT], mode: "dropdown", custom_value: true } } });
      }
      return s;
    }

    _aktionSchema() {
      const s = [{ name: "aktion", selector: { select: { options: [{ value: "mehr", label: "Details der Entität" }, { value: "seite", label: "Seite oder Adresse öffnen" }, { value: "keine", label: "nichts" }], mode: "dropdown" } } }];
      if (this._cfg.aktion === "seite") s.push({ name: "pfad", selector: { text: {} } });
      return s;
    }

    _datenSetzen() {
      const c = this._cfg;
      const a = c.ampel || {};
      if (!this._formen.kopf) return;
      setzeSchema(this._formen.kopf, this._kopfSchema());
      setzeDaten(this._formen.kopf, { titel: c.titel || "", icon: c.icon || "", breite: c.breite ? String(c.breite) : "1" });
      setzeSchema(this._formen.haupt, this._hauptSchema());
      setzeDaten(this._formen.haupt, {
        entity: c.entity || "", attribut: c.attribut || ZUSTAND, format: c.format || "auto", einheit: c.einheit ?? "",
        nachkommastellen: c.nachkommastellen ?? undefined, schrift_modus: c.schrift && c.schrift !== "auto" ? "px" : "auto", schrift_px: Number(c.schrift) || 28,
      });
      setzeSchema(this._formen.ampel, this._ampelSchema());
      setzeDaten(this._formen.ampel, { modus: a.modus || "aus", entity: a.entity || "", attribut: a.attribut || ZUSTAND, grund: a.grund || "", sonst: a.sonst || "" });
      setzeSchema(this._formen.aktion, this._aktionSchema());
      setzeDaten(this._formen.aktion, { aktion: c.aktion || "mehr", pfad: c.pfad || "" });
      for (const el of this.shadowRoot.querySelectorAll("[data-zeile]")) {
        const i = Number(el.dataset.zeile);
        const z = (c.zeilen || [])[i] || {};
        setzeSchema(el, this._zeileSchema(z, i));
        setzeDaten(el, { entity: z.entity || "", attribut: z.attribut || ZUSTAND, label: z.label || "", format: z.format || "auto", einheit: z.einheit || "", nachkommastellen: z.nachkommastellen ?? undefined, text: z.text || "" });
      }
      for (const el of this.shadowRoot.querySelectorAll("[data-ampel]")) {
        const [feld, i] = el.dataset.ampel.split(":");
        const g = (a[feld] || [])[Number(i)] || {};
        setzeDaten(el, feld === "grenzen" ? { ab: g.ab ?? "", farbe: g.farbe || "" } : { wert: g.wert ?? "", farbe: g.farbe || "" });
      }
    }

    _zeileSchema(z, i) {
      const ent = z.entity || this._cfg.entity;
      // „Darstellung“ aufgeklappt, sobald etwas eingestellt ist – und dann offen lassen
      if (!this._darst) this._darst = new Set();
      if (z.format || z.einheit || (z.nachkommastellen !== undefined && z.nachkommastellen !== "") || z.text) this._darst.add(i);
      const offen = this._darst.has(i);
      return [
        { type: "grid", name: "", schema: [
          { name: "label", selector: { text: {} } },
          { name: "entity", selector: { entity: {} } },
        ] },
        { name: "attribut", selector: { select: { options: attributOptionen(this._hass, ent, z.attribut), mode: "dropdown", custom_value: true } } },
        { type: "expandable", name: "", title: "Darstellung", expanded: offen, schema: [
          { type: "grid", name: "", schema: [
            { name: "format", selector: { select: { options: FORMAT_OPT, mode: "dropdown" } } },
            { name: "einheit", selector: { text: {} } },
            { name: "nachkommastellen", selector: { number: { min: 0, max: 6, step: 1, mode: "box" } } },
          ] },
          { name: "text", selector: { text: {} } },
        ] },
      ];
    }

    _zeileEintrag(z, i) {
      const n = (this._cfg.zeilen || []).length;
      const box = document.createElement("div");
      box.className = "eintrag";
      const leiste = document.createElement("div");
      leiste.className = "leiste";
      leiste.innerHTML = `<span class="nr">Zeile ${i + 1}</span>`;
      const hoch = knopf("mdi:arrow-up", "nach oben");
      const runter = knopf("mdi:arrow-down", "nach unten");
      const weg = knopf("mdi:delete-outline", "Zeile entfernen", "rot");
      hoch.disabled = i === 0;
      runter.disabled = i === n - 1;
      hoch.addEventListener("click", () => this._zeileVerschieben(i, -1));
      runter.addEventListener("click", () => this._zeileVerschieben(i, 1));
      weg.addEventListener("click", () => {
        const zl = [...(this._cfg.zeilen || [])];
        zl.splice(i, 1);
        this._darst = new Set();
        this._aendern({ ...this._cfg, zeilen: zl }, true);
      });
      leiste.append(hoch, runter, weg);
      box.appendChild(leiste);
      const f = formular(this._hass, this._zeileSchema(z, i), {}, (v) => {
        const zl = [...(this._cfg.zeilen || [])];
        const alt = zl[i] || {};
        const neu = { label: v.label, entity: v.entity || undefined, attribut: v.attribut && v.attribut !== ZUSTAND ? v.attribut : undefined,
          format: v.format === "auto" ? undefined : v.format, einheit: v.einheit, nachkommastellen: v.nachkommastellen, text: v.text };
        if ((neu.entity || "") !== (alt.entity || "")) neu.attribut = undefined;
        zl[i] = neu;
        this._aendern({ ...this._cfg, zeilen: zl }, (neu.entity || "") !== (alt.entity || ""));
      }, HILFE_ZEILE);
      f.dataset.zeile = String(i);
      box.appendChild(f);
      const vs = document.createElement("div");
      vs.className = "vorschau";
      vs.dataset.v = "zeile:" + i;
      box.appendChild(vs);
      return box;
    }

    _zeileVerschieben(i, d) {
      const zl = [...(this._cfg.zeilen || [])];
      const j = i + d;
      if (j < 0 || j >= zl.length) return;
      [zl[i], zl[j]] = [zl[j], zl[i]];
      this._darst = new Set();
      this._aendern({ ...this._cfg, zeilen: zl }, true);
    }

    _ampelEintrag(feld, g, i) {
      const reihe = document.createElement("div");
      reihe.className = "reihe";
      const punkt = document.createElement("span");
      punkt.className = "farbpunkt";
      punkt.style.marginTop = "22px";
      punkt.style.background = farbeCss(g.farbe) || "var(--divider-color)";
      const schema = [{ type: "grid", name: "", schema: feld === "grenzen"
        ? [{ name: "ab", selector: { number: { mode: "box", step: "any" } } }, { name: "farbe", selector: { select: { options: FARB_OPT, mode: "dropdown", custom_value: true } } }]
        : [{ name: "wert", selector: { text: {} } }, { name: "farbe", selector: { select: { options: FARB_OPT, mode: "dropdown", custom_value: true } } }] }];
      const f = formular(this._hass, schema, {}, (v) => {
        const am = { ...(this._cfg.ampel || {}) };
        const l = [...(am[feld] || [])];
        l[i] = feld === "grenzen" ? { ab: v.ab ?? "", farbe: v.farbe } : { wert: v.wert ?? "", farbe: v.farbe };
        am[feld] = l;
        punkt.style.background = farbeCss(v.farbe) || "var(--divider-color)";
        this._aendern({ ...this._cfg, ampel: am });
      });
      f.dataset.ampel = `${feld}:${i}`;
      const weg = knopf("mdi:delete-outline", "entfernen", "rot");
      weg.style.marginTop = "12px";
      weg.addEventListener("click", () => {
        const am = { ...(this._cfg.ampel || {}) };
        const l = [...(am[feld] || [])];
        l.splice(i, 1);
        am[feld] = l;
        this._aendern({ ...this._cfg, ampel: am }, true);
      });
      reihe.append(punkt, f, weg);
      return reihe;
    }

    _vorschau() {
      if (!this._hass) return;
      const c = this._cfg;
      const tz = this._hass.config ? this._hass.config.time_zone : undefined;
      const r = this.shadowRoot;
      const vh = r.querySelector('[data-v="haupt"]');
      if (vh) {
        if (!c.entity) vh.textContent = "Entität wählen – mit der Suche im Feld.";
        else {
          const roh = wertHolen(this._hass, c.entity, c.attribut);
          const w = formatiere(this._hass, roh, optionen(this._hass, c, tz));
          vh.innerHTML = roh.fehlt ? "Entität nicht gefunden" : `Anzeige: <b>${esc(w.text)}${w.einheit ? " " + esc(w.einheit) : ""}</b>${roh.wert !== undefined && typeof roh.wert !== "object" ? ` · Rohwert ${esc(String(roh.wert).slice(0, 60))}` : ""}`;
        }
      }
      for (const el of r.querySelectorAll('[data-v^="zeile:"]')) {
        const z = (c.zeilen || [])[Number(el.dataset.v.split(":")[1])] || {};
        if (z.text && !z.entity && !z.attribut) {
          el.innerHTML = `Anzeige: <b>${esc(z.label ? z.label + " " : "")}${esc(z.text)}</b>`;
          continue;
        }
        const roh = wertHolen(this._hass, z.entity || c.entity, z.attribut);
        const w = formatiere(this._hass, roh, optionen(this._hass, z, tz));
        el.innerHTML = roh.fehlt ? "Entität fehlt" : `Anzeige: <b>${esc(z.label ? z.label + " " : "")}${esc(w.text)}${w.einheit ? " " + esc(w.einheit) : ""}</b>`;
      }
      const va = r.querySelector('[data-v="ampel"]');
      if (va) {
        const a = c.ampel || {};
        if (!a.modus || a.modus === "aus") va.textContent = "";
        else {
          const roh = a.entity ? wertHolen(this._hass, a.entity, a.attribut) : a.attribut ? wertHolen(this._hass, c.entity, a.attribut) : wertHolen(this._hass, c.entity, c.attribut);
          const x = zahlWert(roh.wert);
          const farbe = ampelFarbe(c, this._hass, wertHolen(this._hass, c.entity, c.attribut));
          const name = Object.entries(FARBEN).find(([, v]) => v === farbe);
          va.innerHTML = `Jetzt: <b>${esc(a.modus === "grenzen" && x !== null ? zahlText(x, istDatum(String(roh.wert)) ? 1 : null, "de") + (istDatum(String(roh.wert)) ? " Tage" : "") : String(roh.wert ?? "–"))}</b> → <b>${farbe ? esc(name ? FARB_NAMEN[name[0]] : farbe) : "keine Farbe"}</b>`;
        }
      }
    }
  }

  class InfoKachelContainerEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._cfg = { reihen: [] };
      this._offen = new Set(); // offene Kacheln als "Reihe:Index"
      this._struktur = "";
    }

    set hass(h) {
      this._hass = h;
      for (const f of this.shadowRoot.querySelectorAll("ha-form, info-kachel-editor")) f.hass = h;
    }

    setConfig(cfg) {
      const c = { ...(cfg || {}) };
      c.reihen = reihenVon(c);
      delete c.kacheln;
      this._cfg = c;
      this._aufbauen();
    }

    connectedCallback() {
      haFormLaden().then(() => this._aufbauen(true));
    }

    _senden() {
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: sauber(this._cfg) } }));
    }

    _aendern(neu, umbauen) {
      this._cfg = neu;
      this._senden();
      this._aufbauen(umbauen);
    }

    static ablage() {
      try {
        const t = localStorage.getItem("info-kachel-ablage");
        return t ? JSON.parse(t) : null;
      } catch (e) {
        return null;
      }
    }

    _reihenKopie() {
      return this._cfg.reihen.map((r) => ({ ...r, kacheln: [...r.kacheln] }));
    }

    /** Reihen/Kacheln umstellen; fn ändert die Reihen und eine Schattenliste der bisherigen Schlüssel gleich,
     *  damit aufgeklappte Kacheln aufgeklappt bleiben ("neu" = neue Kachel aufklappen). */
    _umstellen(fn) {
      const reihen = this._reihenKopie();
      const schatten = this._cfg.reihen.map((r, ri) => r.kacheln.map((_, i) => `${ri}:${i}`));
      fn(reihen, schatten);
      const offen = new Set();
      schatten.forEach((l, ri) => l.forEach((x, i) => {
        if (x === "neu" || (x && this._offen.has(x))) offen.add(`${ri}:${i}`);
      }));
      this._offen = offen;
      this._aendern({ ...this._cfg, reihen }, true);
    }

    _kachelNach(r1, i1, r2, i2) {
      const R = this._cfg.reihen;
      if (!R[r1] || !R[r2] || i1 < 0 || i1 >= R[r1].kacheln.length) return;
      const max = R[r2].kacheln.length - (r1 === r2 ? 1 : 0);
      const ziel = Math.max(0, Math.min(i2, max));
      if (r1 === r2 && ziel === i1) return;
      this._umstellen((reihen, schatten) => {
        const [k] = reihen[r1].kacheln.splice(i1, 1);
        const [x] = schatten[r1].splice(i1, 1);
        reihen[r2].kacheln.splice(ziel, 0, k);
        schatten[r2].splice(ziel, 0, x);
      });
    }

    /** Pfeile: innerhalb der Reihe, am Rand weiter in die Reihe davor/danach */
    _kachelSchritt(r, i, d) {
      const R = this._cfg.reihen;
      if (d < 0) {
        if (i > 0) this._kachelNach(r, i, r, i - 1);
        else if (r > 0) this._kachelNach(r, i, r - 1, R[r - 1].kacheln.length);
      } else if (i < R[r].kacheln.length - 1) this._kachelNach(r, i, r, i + 1);
      else if (r < R.length - 1) this._kachelNach(r, i, r + 1, 0);
    }

    _aufbauen(erzwingen) {
      const R = this._cfg.reihen;
      const schluessel = JSON.stringify([R.map((r) => r.kacheln.length), [...this._offen].sort(), !!customElements.get("ha-form"),
        !!customElements.get("ha-sortable"), JSON.stringify(InfoKachelContainerEditor.ablage())]);
      if (!erzwingen && schluessel === this._struktur && this.shadowRoot.querySelector(".ed")) {
        if (this._kopf) setzeDaten(this._kopf, this._kopfDaten());
        this.shadowRoot.querySelectorAll("ha-form[data-reihe]").forEach((f) => {
          const r = R[Number(f.dataset.reihe)];
          if (r) setzeDaten(f, { titel: r.titel || "", icon: r.icon || "" });
        });
        this.shadowRoot.querySelectorAll("info-kachel-editor").forEach((ed) => {
          const [r, i] = ed.dataset.k.split(":").map(Number);
          const k = R[r] && R[r].kacheln[i];
          if (k && JSON.stringify(sauber(k)) !== JSON.stringify(sauber(ed._cfg))) ed.setConfig(k);
        });
        this._namenAktualisieren();
        return;
      }
      this._struktur = schluessel;
      const wurzel = this.shadowRoot;
      wurzel.innerHTML = `<style>${EDITOR_CSS}</style><div class="ed"></div>`;
      const ed = wurzel.querySelector(".ed");
      if (!customElements.get("ha-form")) {
        ed.innerHTML = `<div class="hinweis">Editor wird geladen …</div>`;
        return;
      }
      this._ziehen = !!customElements.get("ha-sortable");
      const h = (t) => {
        const el = document.createElement("h3");
        el.textContent = t;
        ed.appendChild(el);
      };
      h("Karte");
      this._kopf = formular(this._hass, [
        { type: "grid", name: "", schema: [{ name: "titel", selector: { text: {} } }, { name: "icon", selector: { icon: {} } }] },
        { type: "grid", name: "", schema: [
          { name: "spalten", selector: { select: { options: [{ value: "auto", label: "automatisch" }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))], mode: "dropdown" } } },
          { name: "min_breite", selector: { number: { min: 80, max: 400, step: 10, mode: "box" } } },
          { name: "min_hoehe", selector: { number: { min: 0, max: 400, step: 4, mode: "box" } } },
        ] },
        { name: "strecken", selector: { boolean: {} } },
      ], this._kopfDaten(), (v) => this._aendern({ ...this._cfg, titel: v.titel, icon: v.icon, spalten: v.spalten && v.spalten !== "auto" ? Number(v.spalten) : undefined,
        min_breite: v.min_breite, min_hoehe: v.min_hoehe, strecken: v.strecken ? true : undefined }), HILFE_KARTE, LABEL_KARTE);
      this._kopf.dataset.form = "karte";
      ed.appendChild(this._kopf);

      h(`Reihen (${R.length})`);
      const liste = document.createElement("div");
      liste.className = "liste";
      ed.appendChild(liste);
      R.forEach((r, ri) => liste.appendChild(this._reiheBox(r, ri)));
      const plus = textKnopf("mdi:table-row-plus-after", "Reihe hinzufügen");
      plus.addEventListener("click", () => this._umstellen((reihen, schatten) => {
        reihen.push({ titel: "", kacheln: [] });
        schatten.push([]);
      }));
      ed.appendChild(plus);
      const hn = document.createElement("div");
      hn.className = "hinweis";
      hn.textContent = (this._ziehen ? "Kacheln am Griff ziehen – auch in eine andere Reihe. " : "")
        + "Die Pfeile verschieben eine Kachel innerhalb der Reihe und am Rand weiter in die Reihe davor oder danach. "
        + "In eine andere Karte: ausschneiden (Schere), dort „Einfügen“.";
      ed.appendChild(hn);
      const fuss = document.createElement("div");
      fuss.className = "hinweis";
      fuss.textContent = `Info-Kachel ${IK_VERSION}`;
      ed.appendChild(fuss);
      this._namenAktualisieren();
    }

    _kopfDaten() {
      const c = this._cfg;
      return { titel: c.titel || "", icon: c.icon || "", spalten: c.spalten ? String(c.spalten) : "auto",
        min_breite: c.min_breite ?? undefined, min_hoehe: c.min_hoehe ?? undefined, strecken: !!c.strecken };
    }

    _reiheBox(reihe, ri) {
      const R = this._cfg.reihen;
      const box = document.createElement("div");
      box.className = "eintrag reihe-box";
      const leiste = document.createElement("div");
      leiste.className = "leiste";
      leiste.innerHTML = `<span class="nr" data-reihe-nr="${ri}"></span>`;
      const hoch = knopf("mdi:arrow-up", "Reihe nach oben");
      const runter = knopf("mdi:arrow-down", "Reihe nach unten");
      const weg = knopf("mdi:delete-outline", "Reihe löschen", "rot");
      hoch.disabled = ri === 0;
      runter.disabled = ri === R.length - 1;
      hoch.addEventListener("click", () => this._reiheNach(ri, ri - 1));
      runter.addEventListener("click", () => this._reiheNach(ri, ri + 1));
      weg.addEventListener("click", () => this._umstellen((reihen, schatten) => {
        reihen.splice(ri, 1);
        schatten.splice(ri, 1);
      }));
      leiste.append(hoch, runter, weg);
      box.appendChild(leiste);
      const f = formular(this._hass, [{ type: "grid", name: "", schema: [{ name: "titel", selector: { text: {} } }, { name: "icon", selector: { icon: {} } }] }],
        { titel: reihe.titel || "", icon: reihe.icon || "" }, (v) => {
          const reihen = this._reihenKopie();
          reihen[ri] = { ...reihen[ri], titel: v.titel, icon: v.icon };
          this._aendern({ ...this._cfg, reihen });
        }, {}, LABEL_REIHE);
      f.dataset.reihe = String(ri);
      box.appendChild(f);

      const kl = document.createElement("div");
      kl.className = "liste kliste";
      if (this._ziehen) {
        const sort = document.createElement("ha-sortable");
        sort.setAttribute("handle-selector", ".griff");
        sort.setAttribute("group", "info-kachel");
        try {
          sort.handleSelector = ".griff";
          sort.group = "info-kachel";
        } catch (e) {
          /* egal */
        }
        sort.addEventListener("item-moved", (e) => {
          e.stopPropagation();
          const { oldIndex, newIndex } = e.detail || {};
          setTimeout(() => this._kachelNach(ri, oldIndex, ri, newIndex), 0);
        });
        sort.addEventListener("item-added", (e) => {
          e.stopPropagation();
          const d = (e.detail && e.detail.data) || {};
          const ziel = e.detail ? e.detail.index : 0;
          if (Number.isInteger(d.r) && Number.isInteger(d.i)) setTimeout(() => this._kachelNach(d.r, d.i, ri, ziel), 0);
        });
        sort.addEventListener("item-removed", (e) => e.stopPropagation());
        sort.appendChild(kl);
        box.appendChild(sort);
      } else box.appendChild(kl);
      reihe.kacheln.forEach((k, i) => kl.appendChild(this._eintrag(k, ri, i)));

      const knoepfe = document.createElement("div");
      knoepfe.className = "knoepfe";
      const plus = textKnopf("mdi:plus", "Kachel hinzufügen");
      plus.addEventListener("click", () => this._umstellen((reihen, schatten) => {
        reihen[ri].kacheln.push({});
        schatten[ri].push("neu");
      }));
      knoepfe.appendChild(plus);
      const abl = InfoKachelContainerEditor.ablage();
      const einf = textKnopf("mdi:content-paste", abl ? `Einfügen: ${abl.titel || abl.entity || "Kachel"}` : "Einfügen (Ablage leer)");
      einf.disabled = !abl;
      einf.addEventListener("click", () => {
        const k = InfoKachelContainerEditor.ablage();
        if (!k) return;
        this._umstellen((reihen, schatten) => {
          reihen[ri].kacheln.push(k);
          schatten[ri].push(null);
        });
      });
      knoepfe.appendChild(einf);
      box.appendChild(knoepfe);
      return box;
    }

    _reiheNach(r1, r2) {
      if (r2 < 0 || r2 >= this._cfg.reihen.length) return;
      this._umstellen((reihen, schatten) => {
        reihen.splice(r2, 0, reihen.splice(r1, 1)[0]);
        schatten.splice(r2, 0, schatten.splice(r1, 1)[0]);
      });
    }

    _name(k) {
      const st = k.entity && this._hass ? this._hass.states[k.entity] : null;
      return { titel: k.titel || (st && st.attributes.friendly_name) || k.entity || "neue Kachel", unter: k.titel ? k.entity || "" : k.attribut || "" };
    }

    _namenAktualisieren() {
      const R = this._cfg.reihen;
      this.shadowRoot.querySelectorAll("[data-reihe-nr]").forEach((el) => {
        const ri = Number(el.dataset.reiheNr);
        const r = R[ri];
        if (r) el.textContent = `Reihe ${ri + 1}${r.titel ? " · " + r.titel : ""}`;
      });
      this.shadowRoot.querySelectorAll(".kachel-kopf").forEach((kk) => {
        const [r, i] = kk.dataset.k.split(":").map(Number);
        const k = R[r] && R[r].kacheln[i];
        if (!k) return;
        const n = this._name(k);
        const nm = kk.querySelector(".name");
        nm.textContent = n.titel;
        if (n.unter) {
          const sm = document.createElement("small");
          sm.textContent = n.unter;
          nm.appendChild(sm);
        }
        const farbe = ampelFarbe(k, this._hass, wertHolen(this._hass, k.entity, k.attribut));
        kk.querySelector(".farbpunkt").style.background = farbe || "var(--divider-color)";
      });
    }

    _eintrag(k, r, i) {
      const R = this._cfg.reihen;
      const schl = `${r}:${i}`;
      const box = document.createElement("div");
      box.className = "eintrag" + (this._offen.has(schl) ? " offen" : "");
      box.sortableData = { r, i };
      const kopf = document.createElement("div");
      kopf.className = "kachel-kopf";
      kopf.dataset.k = schl;
      kopf.innerHTML = `${this._ziehen ? `<span class="griff" title="ziehen zum Verschieben"><ha-icon icon="mdi:drag"></ha-icon></span>` : ""}<span class="pfeil"><ha-icon icon="mdi:chevron-right"></ha-icon></span><span class="farbpunkt"></span><span class="name"></span>`;
      const griff = kopf.querySelector(".griff");
      if (griff) griff.addEventListener("click", (e) => e.stopPropagation());
      const hoch = knopf("mdi:arrow-up", "nach vorn");
      const runter = knopf("mdi:arrow-down", "nach hinten");
      const kopie = knopf("mdi:content-copy", "kopieren (Ablage)");
      const dupl = knopf("mdi:plus-box-multiple-outline", "verdoppeln");
      const aus = knopf("mdi:content-cut", "ausschneiden (zum Einfügen in einer anderen Karte)");
      const weg = knopf("mdi:delete-outline", "löschen", "rot");
      hoch.disabled = r === 0 && i === 0;
      runter.disabled = r === R.length - 1 && i === R[r].kacheln.length - 1;
      const stop = (fn) => (e) => {
        e.stopPropagation();
        fn();
      };
      hoch.addEventListener("click", stop(() => this._kachelSchritt(r, i, -1)));
      runter.addEventListener("click", stop(() => this._kachelSchritt(r, i, 1)));
      kopie.addEventListener("click", stop(() => this._ablegen(r, i, false)));
      aus.addEventListener("click", stop(() => this._ablegen(r, i, true)));
      dupl.addEventListener("click", stop(() => this._umstellen((reihen, schatten) => {
        reihen[r].kacheln.splice(i + 1, 0, JSON.parse(JSON.stringify(reihen[r].kacheln[i])));
        schatten[r].splice(i + 1, 0, null);
      })));
      weg.addEventListener("click", stop(() => this._umstellen((reihen, schatten) => {
        reihen[r].kacheln.splice(i, 1);
        schatten[r].splice(i, 1);
      })));
      kopf.append(hoch, runter, kopie, dupl, aus, weg);
      kopf.addEventListener("click", () => {
        if (this._offen.has(schl)) this._offen.delete(schl);
        else this._offen.add(schl);
        this._aufbauen(true);
      });
      box.appendChild(kopf);
      if (this._offen.has(schl)) {
        const ed = document.createElement("info-kachel-editor");
        ed.eingebettet = true;
        ed.dataset.k = schl;
        ed.hass = this._hass;
        ed.setConfig(k);
        ed.addEventListener("kachel-geaendert", (e) => {
          e.stopPropagation();
          const reihen = this._reihenKopie();
          reihen[r].kacheln[i] = e.detail.config;
          this._cfg = { ...this._cfg, reihen };
          this._senden();
          this._namenAktualisieren();
        });
        box.appendChild(ed);
      }
      return box;
    }

    _ablegen(r, i, ausschneiden) {
      try {
        localStorage.setItem("info-kachel-ablage", JSON.stringify(this._cfg.reihen[r].kacheln[i]));
      } catch (e) {
        /* egal */
      }
      if (ausschneiden) {
        this._umstellen((reihen, schatten) => {
          reihen[r].kacheln.splice(i, 1);
          schatten[r].splice(i, 1);
        });
      } else this._aufbauen(true);
    }
  }

  if (!customElements.get("info-kachel-editor")) customElements.define("info-kachel-editor", InfoKachelEditor);
  if (!customElements.get("info-kachel-container-editor")) customElements.define("info-kachel-container-editor", InfoKachelContainerEditor);

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "info-kachel")) {
    window.customCards.push(
      { type: "info-kachel", name: "Info-Kachel", description: "Eine Kachel: Titel, großer Hauptwert, Zeilen mit weiteren Werten, Ampelfarbe – alles im Editor einstellbar.", preview: true },
      { type: "info-kachel-container", name: "Info-Kachel-Container", description: "Eine oder mehrere Reihen mit Überschrift und beliebig vielen Info-Kacheln.", preview: true },
    );
  }
  console.info(`%c INFO-KACHEL %c ${IK_VERSION} `, "background:#2a78d6;color:#fff;border-radius:3px 0 0 3px", "background:#ddd;color:#000;border-radius:0 3px 3px 0");
}
