/** Every message the bot sends: text (Telegram HTML) + buttons. No logic about what to ask next. */
import { InlineKeyboard, Keyboard } from "grammy";
import { ALTERNATE_COMPONENTS, COMPONENTS, districtName, NEIGHBOURS, STOCK_URL } from "../../src/lib/eraktkosh";
import { rankBanks } from "../../src/lib/parse";
import { mapsUrl, shareMessage, whatsappUrl } from "../../src/lib/share";
import type { Bank, BloodGroup, SearchQuery } from "../../src/lib/types";
import { parseQuery } from "../../src/lib/validate";
import { distanceKm, placeFromAddress } from "./areas";
import { config } from "./config";
import type { GroupBase } from "./parser";
import type { StockResult } from "./search";
import type { Alert, Draft, Spot } from "./store";

export interface Msg {
  text: string;
  keyboard?: InlineKeyboard | Keyboard;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- labels ----------

export function groupLabel(g: BloodGroup) {
  const base = g.slice(0, -1);
  const sign = g.endsWith("+") ? "+" : "−";
  return base === "Oh" ? `Oh${sign} (Bombay)` : `${base}${sign}`;
}

const NAME: Record<string, string> = {
  "11": "Whole Blood",
  "12": "Packed Red Cells (PRBC)",
  "28": "SAGM Red Cells",
  "14": "Single Donor Platelets (SDP)",
  "23": "Random Donor Platelets (RDP)",
  "13": "Fresh Frozen Plasma (FFP)",
  "19": "Plasma",
  "17": "Cryoprecipitate",
};
const SHORT: Record<string, string> = { "11": "Whole Blood", "12": "PRBC", "28": "SAGM RBC", "14": "SDP", "23": "RDP", "13": "FFP", "19": "Plasma", "17": "Cryo" };
export const componentLabel = (c: string) => NAME[c] ?? COMPONENTS[c] ?? `Component ${c}`;

const spotName = (s: Spot) => (s.pin ? `you (${s.name})` : s.name);
const whereText = (q: Pick<SearchQuery, "district">, spot?: Spot) =>
  spot?.precise ? `near ${esc(spotName(spot))}` : `in ${esc(districtName(q.district))}`;

export function ago(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "time unknown";
  if (hours < 1 / 60) return "just now";
  if (hours < 1) return `${Math.round(hours * 60)} min ago`;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
export const agoIso = (iso: string) => ago((Date.now() - Date.parse(iso)) / 3_600_000);

const FRESH: Record<Bank["freshness"], string> = { fresh: "🟢", recent: "🟡", stale: "🔴", unknown: "⚪" };

function phone(d: string) {
  if (/^[6-9]\d{9}$/.test(d)) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  if (/^0\d{10}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return d;
}

const unitText = (n: number | null) => (n === null ? "in stock (count not shown)" : `${n} unit${n === 1 ? "" : "s"}`);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const FOOTER = "⚠️ Stock is what blood banks report on eRaktKosh. <b>Call before you travel.</b> Emergency: <b>108</b>";

// ---------- callback data + deep links ----------

/** Compact query for button data, e.g. "O-:11:572". Always re-validated when tapped. */
export const qk = (q: Pick<SearchQuery, "group" | "component" | "district">) => `${q.group}:${q.component}:${q.district}`;
export function fromQk(s: string): SearchQuery | null {
  const [group, component, district] = s.split(":");
  const v = parseQuery({ group, component, district, state: "29" });
  return v.ok ? v.query : null;
}

const encGroup = (g: BloodGroup) => g.replace("+", "pos").replace("-", "neg");
/** t.me/<bot>?start=<payload>. Telegram allows only A-Z a-z 0-9 _ - (so no "+"). e.g. "Oneg_11_572", "alert_ABpos_14_572" */
export const startPayload = (q: Pick<SearchQuery, "group" | "component" | "district">, alert = false) =>
  `${alert ? "alert_" : ""}${encGroup(q.group)}_${q.component}_${q.district}`;

export function parseStartPayload(p: string): { query: SearchQuery; alert: boolean } | null {
  const m = p.trim().match(/^(alert_)?(AB|Oh|A|B|O)(pos|neg)_(\d{1,3})_(\d{1,4})$/i);
  if (!m) return null;
  const base = m[2].toLowerCase() === "oh" ? "Oh" : m[2].toUpperCase();
  const v = parseQuery({ group: `${base}${m[3].toLowerCase() === "pos" ? "+" : "-"}`, component: m[4], district: m[5], state: "29" });
  return v.ok ? { query: v.query, alert: !!m[1] } : null;
}

/** "Open in web app" link. Telegram refuses localhost URLs in buttons, so it only appears once the app is reachable. */
export function webAppLink(q: Pick<SearchQuery, "group" | "component" | "district">): string | null {
  try {
    const u = new URL(config.webAppUrl);
    if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname)) return null;
    u.searchParams.set("group", q.group);
    u.searchParams.set("component", q.component);
    u.searchParams.set("district", q.district);
    return u.toString();
  } catch {
    return null;
  }
}

// ---------- distances ----------

export interface Placed {
  bank: Bank;
  km: number | null;
}

const points = new Map<string, { lat: number; lng: number } | null>();
function bankPoint(b: Bank) {
  const k = `${b.name}|${b.address}`;
  if (!points.has(k)) points.set(k, placeFromAddress(b.address) ?? placeFromAddress(b.name));
  return points.get(k)!;
}

export function placeBanks(banks: Bank[], origin?: Spot): Placed[] {
  const o = origin?.precise && origin.lat != null && origin.lng != null ? { lat: origin.lat, lng: origin.lng } : null;
  return banks.map((bank) => {
    const p = o ? bankPoint(bank) : null;
    return { bank, km: o && p ? distanceKm(o, p) : null };
  });
}

const trust = (b: Bank) => (b.freshness === "fresh" || b.freshness === "recent" ? 0 : b.freshness === "unknown" ? 1 : 2);

/** Has the group → recently updated → closest → most units. Stale stock (months old) never outranks fresh. */
export const orderForNeed = (list: Placed[]) =>
  [...list].sort(
    (a, b) =>
      Number(b.bank.hasRequested) - Number(a.bank.hasRequested) ||
      trust(a.bank) - trust(b.bank) ||
      (a.km ?? Infinity) - (b.km ?? Infinity) ||
      b.bank.score - a.bank.score,
  );

const orderByDistance = (list: Placed[]) =>
  [...list].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || b.bank.score - a.bank.score);

const kmText = (km: number | null) => (km == null ? "" : km < 1 ? " · &lt;1 km" : ` · ~${Math.round(km)} km`);

function contactLine(b: Bank) {
  const tel = b.phones.length ? `📞 ${b.phones.slice(0, 2).map(phone).join(" / ")}` : "📞 number not listed";
  return `${tel} · <a href="${esc(mapsUrl(b))}">Map</a>`;
}
const freshText = (b: Bank) => `${FRESH[b.freshness]} ${b.lastUpdated ? `updated ${ago(b.ageHours)}` : "update time unknown"}`;

function bankBlock(p: Placed, group: BloodGroup, i: number, showDistrict = false) {
  const b = p.bank;
  const stock = b.hasRequested ? `${groupLabel(group)}: <b>${unitText(b.requestedUnits)}</b>` : `No ${groupLabel(group)} listed`;
  const dist = showDistrict ? ` · 📍 ${esc(districtName(b.district))}` : "";
  return [`${i}. <b>${esc(b.name)}</b>${kmText(p.km)}${dist}`, `    ${stock} · ${freshText(b)} · ${esc(b.category)}`, `    ${contactLine(b)}`].join(
    "\n",
  );
}

// ---------- results ----------

export function rank(r: StockResult) {
  return rankBanks(r.raw, { group: r.query.group, district: r.query.district, component: r.query.component, now: new Date() });
}

export function resultMessage(r: StockResult, spot: Spot | undefined, opts: { all?: boolean; alt?: boolean } = {}): Msg {
  const q = r.query;
  const placed = orderForNeed(placeBanks(rank(r), spot));
  const withStock = placed.filter((p) => p.bank.hasRequested);
  const g = groupLabel(q.group);
  const lines = [`🩸 <b>${g} · ${componentLabel(q.component)}</b> · ${whereText(q, spot)}`];
  if (opts.alt) lines.push("⚠️ <i>This is a different component from what you asked for. Ask your doctor if it can be used.</i>");
  if (r.source === "cache") {
    lines.push(`⚠️ <i>Live check failed${r.reason ? ` (${esc(r.reason)})` : ""}. Showing the last saved result.</i>`);
  }
  const checked = `checked ${agoIso(r.checkedAt)}`;

  if (withStock.length) {
    const n = withStock.length;
    lines.push(`<b>${n} blood ${plural(n, "bank reports", "banks report")} ${g} in stock</b> · ${checked}`, "");
    const show = withStock.slice(0, opts.all ? 15 : 5);
    show.forEach((p, i) => lines.push(bankBlock(p, q.group, i + 1), ""));
    if (!opts.all && n > 5) lines.push(`➕ ${n - 5} more: tap <b>Show all</b>.`, "");
  } else {
    lines.push(`<b>No blood bank reports ${g} ${componentLabel(q.component)} right now</b> · ${checked}`, "");
    lines.push("<b>What you can do:</b>", "• Call the blood banks below. Stock changes quickly.", "• Tap 🔔 and I'll message you the moment it shows up.");
    if (NEIGHBOURS[q.district]) lines.push("• Check nearby districts (button below).");
    const alt = ALTERNATE_COMPONENTS[q.component]?.[0];
    if (alt) lines.push(`• Ask your doctor whether ${componentLabel(alt)} can be used instead.`);
    lines.push("");
    const call = orderByDistance(placed)
      .filter((p) => p.bank.phones.length)
      .slice(0, 3);
    if (call.length) {
      lines.push(`<b>${spot?.precise ? "Nearest blood banks" : "Blood banks"} to call:</b>`);
      call.forEach((p, i) => lines.push(`${i + 1}. <b>${esc(p.bank.name)}</b>${kmText(p.km)}`, `    ${contactLine(p.bank)}`));
      lines.push("");
    }
  }
  lines.push(FOOTER);
  return { text: lines.join("\n"), keyboard: resultKeyboard(q, withStock.length > 0, !opts.all && withStock.length > 5) };
}

function resultKeyboard(q: SearchQuery, found: boolean, more: boolean) {
  const k = qk(q);
  const kb = new InlineKeyboard();
  if (found) {
    kb.text("🔔 Alert me if more appears", `a:${k}`).row();
    kb.text("🔄 Refresh", `r:${k}`).text("📤 Share", `sh:${k}`);
    if (more) kb.row().text("📋 Show all", `all:${k}`);
  } else {
    kb.text("🔔 Alert me when it's available", `a:${k}`).row();
    if (NEIGHBOURS[q.district]) kb.text("🔍 Check nearby districts", `w:${k}`).row();
    const alt = ALTERNATE_COMPONENTS[q.component]?.[0];
    if (alt) kb.text(`🧪 Try ${SHORT[alt]} (ask doctor)`, `alt:${k}`).row();
    kb.text("🔄 Refresh", `r:${k}`);
  }
  const web = webAppLink(q);
  if (web) kb.row().url("🌐 Open in web app", web);
  return kb;
}

export function failedMessage(r: StockResult): Msg {
  const text = [
    "⚠️ <b>I couldn't read eRaktKosh just now.</b>",
    r.reason ? `<i>${esc(r.reason)}</i>` : "",
    "",
    "Please try again in a minute. If it's an emergency, call <b>108</b> or the hospital's blood bank directly.",
    `You can also check the portal yourself: <a href="${STOCK_URL}">eRaktKosh blood stock</a>`,
  ]
    .filter((l, i) => l || i === 2)
    .join("\n");
  return { text, keyboard: new InlineKeyboard().text("🔄 Try again", `r:${qk(r.query)}`) };
}

/** Banks near a place, closest first, with whatever stock they list. */
export function nearestMessage(r: StockResult, spot: Spot, donate = false): Msg {
  const q = r.query;
  const placed = orderByDistance(placeBanks(rank(r), spot));
  const comp = SHORT[q.component] ?? componentLabel(q.component);
  const lines = donate
    ? [`❤️ <b>Thank you for wanting to donate!</b>`, `Blood banks ${whereText(q, spot)}. Call ahead to check donation timings.`, ""]
    : [`🏥 <b>Blood banks ${whereText(q, spot)} with blood in stock</b>`, ""];
  placed.slice(0, 6).forEach((p, i) => {
    const b = p.bank;
    const have = Object.entries(b.units)
      .filter(([, v]) => v === null || (v ?? 0) > 0)
      .map(([grp, v]) => `${groupLabel(grp as BloodGroup)}${v ? ` ${v}` : ""}`);
    const stock = have.length ? `${comp} in stock: ${have.join(" · ")}` : `No ${comp.toLowerCase()} listed`;
    lines.push(`${i + 1}. <b>${esc(b.name)}</b>${kmText(p.km)}`, `    🩸 ${stock} · ${freshText(b)}`, `    ${contactLine(b)}`, "");
  });
  if (!placed.length) lines.push(`No blood bank in ${esc(districtName(q.district))} reports ${comp.toLowerCase()} in stock right now.`, "");
  if (!spot.precise) lines.push("📍 Send your location or type your area to sort these by distance.", "");
  lines.push(`<i>Stock checked ${agoIso(r.checkedAt)}.</i>`);
  lines.push(FOOTER);
  return { text: lines.join("\n"), keyboard: new InlineKeyboard().text("🩸 Find a blood group here", `fg:${q.district}`) };
}

/** Results from the neighbouring districts, merged. */
export function nearbyMessage(q: SearchQuery, results: StockResult[], spot?: Spot): Msg {
  const found = orderForNeed(results.filter((r) => r.ok).flatMap((r) => placeBanks(rank(r), spot))).filter((p) => p.bank.hasRequested);
  const failed = results.filter((r) => !r.ok).length;
  const names = results.map((r) => districtName(r.query.district)).join(", ");
  const g = groupLabel(q.group);
  const lines = [`🔍 <b>${g} · ${componentLabel(q.component)}</b> in nearby districts`];
  if (found.length) {
    lines.push(`<b>${found.length} blood ${plural(found.length, "bank reports", "banks report")} it</b>`, "");
    found.slice(0, 6).forEach((p, i) => lines.push(bankBlock(p, q.group, i + 1, true), ""));
  } else {
    lines.push(`None of the nearby districts (${esc(names)}) report it right now.`, "");
  }
  if (failed) lines.push(`<i>${failed} ${plural(failed, "district", "districts")} couldn't be checked.</i>`);
  lines.push(FOOTER);
  return { text: lines.join("\n"), keyboard: new InlineKeyboard().text("🔔 Alert me when it's available", `a:${qk(q)}`) };
}

/** Plain text (no HTML) so it forwards cleanly to WhatsApp groups. */
export function shareText(r: StockResult) {
  const link = config.username ? `\nFind blood fast: t.me/${config.username}` : "";
  return shareMessage(r.query.group, r.query.component, rank(r)) + link;
}
export const shareKeyboard = (text: string) => new InlineKeyboard().url("🟢 Share on WhatsApp", whatsappUrl(text));

// ---------- progress ----------

export function statusText(q: SearchQuery, spot: Spot | undefined, s: { seconds: number; progress: string; queued: number; nearest?: boolean }) {
  const what = s.nearest
    ? `🔎 Getting blood banks ${whereText(q, spot)} from eRaktKosh`
    : `🔎 Checking eRaktKosh for <b>${groupLabel(q.group)}</b> · ${componentLabel(q.component)} · ${whereText(q, spot)}`;
  const wait = s.queued ? `⏳ Waiting for a free agent (${s.queued} ahead)…` : `⏳ ${s.seconds}s · ${esc(s.progress)}`;
  const hint = "An AI agent is filling in the government form for you. This takes 2–4 minutes; you can leave the chat, I'll message you.";
  return [what, wait, `<i>${hint}</i>`].join("\n");
}
export const watchKeyboard = (url: string) => new InlineKeyboard().url("👀 Watch the agent live", url);

// ---------- questions ----------

export const welcome = (): Msg => ({
  text: [
    "🩸 <b>BloodLink</b> finds blood banks that have your blood group <b>in stock right now</b>, using live government data (eRaktKosh).",
    "",
    "Just type what you need:",
    "• <i>need O- blood near HSR</i>",
    "• <i>B+ platelets in Jayanagar</i>",
    "• <i>nearest blood bank</i>",
    "",
    "Covers all of Karnataka. Emergency: <b>108</b>",
  ].join("\n"),
  keyboard: new InlineKeyboard().text("🩸 I need blood", "start:blood").text("🏥 Nearest blood bank", "start:nearest"),
});

export const help = (): Msg => ({
  text: [
    "<b>How BloodLink works</b>",
    "1. Tell me the blood group and area, e.g. <i>O- near Koramangala</i>. I'll ask for anything missing.",
    `2. An AI agent (TinyFish) checks the government's eRaktKosh portal live. 2–4 minutes, or instant if someone searched the same in the last ${config.cacheTtlMinutes} min.`,
    "3. You get blood banks with stock, phone numbers, map links and how fresh their data is.",
    "",
    "<b>Also</b>",
    `🔔 <i>Alert me</i>: I message you when stock appears (checks every ${config.alertIntervalMinutes} min, for ${config.alertTtlHours} h). /alerts to manage.`,
    "📤 <i>Share</i>: a ready message for family WhatsApp groups.",
    "📍 Send your location to find the nearest blood banks.",
    "",
    "<b>Good to know</b>",
    "• Stock is what blood banks report. Always call before you travel.",
    "• I don't give medical advice. Your doctor decides on substitutes.",
    "• I store only this chat's ID and your alerts.",
    "",
    "Emergency ambulance: <b>108</b>",
  ].join("\n"),
  keyboard: welcome().keyboard,
});

export const didNotGet = (): Msg => ({
  text: "🤔 Sorry, I didn't get that. Try <i>need O- blood near HSR</i> or <i>nearest blood bank</i>, or tap a button below.",
  keyboard: welcome().keyboard,
});

export const thanks = (): Msg => ({ text: "🙏 Take care. I'm here whenever you need me. Emergency: <b>108</b>" });

export function askGroup(d: Draft, again = false): Msg {
  const what = d.component ? ` (${componentLabel(d.component)})` : d.componentChoices?.includes("23") ? " (platelets)" : "";
  const text = again
    ? "Please pick the blood group below, or type it (e.g. <i>O-</i>, <i>B positive</i>)."
    : `🩸 Which blood group does the patient need${what}?`;
  const kb = new InlineKeyboard();
  (["A+", "A-", "B+", "B-"] as BloodGroup[]).forEach((g) => kb.text(groupLabel(g), `g:${g}`));
  kb.row();
  (["O+", "O-", "AB+", "AB-"] as BloodGroup[]).forEach((g) => kb.text(groupLabel(g), `g:${g}`));
  kb.row().text("Oh+ (Bombay)", "g:Oh+").text("Oh− (Bombay)", "g:Oh-");
  kb.row().text("🏥 Not sure, show nearest blood banks", "n");
  return { text, keyboard: kb };
}

export function askSign(base: GroupBase): Msg {
  const name = base === "Oh" ? "Bombay (Oh)" : base;
  return {
    text: `Is it <b>${name} positive</b> or <b>${name} negative</b>?`,
    keyboard: new InlineKeyboard()
      .text(`${base === "Oh" ? "Oh" : base}+ positive`, `g:${base}+`)
      .text(`${base === "Oh" ? "Oh" : base}− negative`, `g:${base}-`),
  };
}

export function askComponent(choices: string[]): Msg {
  const platelets = choices.includes("23") || choices.includes("14");
  const kb = new InlineKeyboard();
  choices.forEach((c) => kb.text(componentLabel(c), `c:${c}`).row());
  return {
    text: platelets
      ? "Which platelets? <i>(The doctor's request slip usually says.)</i>"
      : "Which plasma? <i>(The doctor's request slip usually says.)</i>",
    keyboard: kb,
  };
}

export function askPlace(d: Draft, again = false): Msg {
  const who = d.intent === "blood" ? "Where is the patient?" : "Where are you?";
  const text = again
    ? "Please send your location or type an area (e.g. <i>HSR</i>, <i>Jayanagar</i>, <i>St John's</i>)."
    : `📍 <b>${who}</b>\nTap <b>Send my location</b> below, or type an area or landmark (e.g. <i>HSR</i>, <i>Jayanagar</i>, <i>St John's</i>).`;
  const kb = new Keyboard()
    .requestLocation("📍 Send my location")
    .row()
    .text("Bangalore Urban")
    .text("Mysuru")
    .text("Mangaluru")
    .row()
    .text("Hubballi")
    .text("Belagavi")
    .text("Kalaburagi")
    .resized()
    .oneTime();
  return { text, keyboard: kb };
}

const COVERED = "all 31 districts of Karnataka";

export const outside = (name: string): Msg => ({
  text: [
    `📍 <b>${esc(name)}</b> isn't covered yet. I can search ${COVERED}.`,
    `You can still check the government portal: <a href="${STOCK_URL}">eRaktKosh blood stock</a>`,
    "Emergency: <b>108</b>",
  ].join("\n"),
});

export const locationOutside = (lat: number, lng: number): Msg => ({
  text: [
    `📍 Your location is outside the area I cover (${COVERED}).`,
    `<a href="https://www.google.com/maps/search/blood+bank/@${lat.toFixed(5)},${lng.toFixed(5)},13z">Blood banks near you on Google Maps</a> · <a href="${STOCK_URL}">eRaktKosh</a>`,
    "Emergency: <b>108</b>",
  ].join("\n"),
});

export const notFound = (text: string): Msg => ({
  text: `🤔 I couldn't find “${esc(text)}”. Type a nearby area or landmark (e.g. <i>HSR</i>, <i>Jayanagar</i>, <i>St John's</i>), or tap <b>Send my location</b>.`,
});

// ---------- alerts ----------

const alertWhat = (a: Pick<Alert, "group" | "component" | "district">) =>
  `${groupLabel(a.group)} · ${componentLabel(a.component)} · ${esc(districtName(a.district))}`;
const hoursLeft = (a: Alert) => Math.max(0, Math.round((Date.parse(a.expiresAt) - Date.now()) / 3_600_000));

export function alertConfirm(a: Alert): Msg {
  const lines = [
    `🔔 <b>Alert on</b>: ${alertWhat(a)}`,
    `I'll check eRaktKosh every ${config.alertIntervalMinutes} min for the next ${config.alertTtlHours} h and message you as soon as a <b>new</b> blood bank reports it.`,
    "Manage with /alerts.",
  ];
  return { text: lines.join("\n"), keyboard: new InlineKeyboard().text("🔕 Stop this alert", `x:${a.id}`) };
}

export function alertsList(list: Alert[]): Msg {
  if (!list.length) return { text: "You have no alerts. Search for blood, then tap <b>🔔 Alert me</b>." };
  const kb = new InlineKeyboard();
  const lines = ["🔔 <b>Your alerts</b>"];
  list.forEach((a, i) => {
    lines.push(`${i + 1}. ${alertWhat(a)} · ends in ${hoursLeft(a)} h`);
    kb.text(`🔕 Stop #${i + 1}`, `x:${a.id}`).row();
  });
  return { text: lines.join("\n"), keyboard: kb };
}

export function alertMessage(a: Alert, fresh: Bank[], r: StockResult): Msg {
  const placed = orderForNeed(placeBanks(fresh, a.spot));
  const lines = [`🔔 <b>Good news: ${groupLabel(a.group)} ${componentLabel(a.component)} is now reported</b> · ${whereText(a, a.spot)}`, ""];
  placed.slice(0, 3).forEach((p, i) => lines.push(bankBlock(p, a.group, i + 1), ""));
  lines.push(FOOTER);
  return {
    text: lines.join("\n"),
    keyboard: new InlineKeyboard().text("📋 See all", `all:${qk(a)}`).text("🔕 Stop alert", `x:${a.id}`),
  };
}

export const alertExpired = (a: Alert): Msg => ({
  text: `⏰ Your alert for ${alertWhat(a)} ended after ${config.alertTtlHours} h.`,
  keyboard: new InlineKeyboard().text(`🔔 Renew for ${config.alertTtlHours} h`, `rn:${qk(a)}`),
});
