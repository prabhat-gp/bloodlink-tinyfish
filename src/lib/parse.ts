import type { Bank, BloodGroup, Freshness, RawBank, Units } from "./types";

const GROUP_RE = /^(ab|oh|a|b|o)\s*([+-])\s*ve(?:\s*:\s*(\d+))?$/i;

function toGroup(letters: string, sign: string): BloodGroup {
  const l = letters.toLowerCase();
  const base = l === "ab" ? "AB" : l === "oh" ? "Oh" : l.toUpperCase();
  return `${base}${sign}` as BloodGroup;
}

/**
 * Parse eRaktKosh availability text. The site uses two formats:
 *   "Available, O+Ve:18, AB+Ve:3"      → counts
 *   "Available, O +ve, B +ve, O -ve"    → in stock, no counts (null)
 *   "Whole BloodNot Available Search for another Component" → nothing
 */
export function parseAvailability(text: string | undefined | null): { available: boolean; units: Units } {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t || /not\s*available/i.test(t) || !/^available/i.test(t)) return { available: false, units: {} };

  const units: Units = {};
  for (const token of t.replace(/^available\s*,?/i, "").split(",")) {
    const m = token.trim().match(GROUP_RE);
    if (!m) continue;
    const g = toGroup(m[1], m[2]);
    const n = m[3] === undefined ? null : Number(m[3]);
    // Duplicate group: keep the larger known count.
    const prev = units[g];
    units[g] = prev == null || n == null ? (n ?? prev ?? null) : Math.max(prev, n);
  }
  const available = Object.values(units).some((v) => v === null || v > 0);
  return { available, units };
}

/** Pull Indian phone numbers (10-digit mobile or STD landline) out of free text. */
export function extractPhones(text: string | undefined | null): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:\+?91[\s-]?)?(0?\d[\d\s-]{8,13}\d)/g)) {
    const digits = m[1].replace(/\D/g, "");
    const d = digits.length === 11 && digits.startsWith("0") ? digits : digits.slice(-10);
    if (d.length >= 10 && d.length <= 11 && !/^0+$/.test(d)) found.add(d);
  }
  return [...found];
}

/** The site renders emails like "blood.bank1@fortishealthcare,com". */
export function cleanEmail(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.replace(/,(com|in|org|net|co)\b/gi, ".$1").match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  return m ? m[0].toLowerCase() : null;
}

/** "2026-10-31 00:29:06" or "2026-03-05 09:45:47.863" (IST) → age in hours. */
export function ageHours(lastUpdated: string | undefined | null, now: Date): number | null {
  if (!lastUpdated) return null;
  const m = lastUpdated.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  // Site timestamps are IST (UTC+5:30).
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) - 5.5 * 3600_000;
  const h = (now.getTime() - utc) / 3600_000;
  return h < -1 ? null : Math.max(0, h); // far-future timestamps are treated as bad data
}

export function freshness(age: number | null): Freshness {
  if (age === null) return "unknown";
  if (age < 6) return "fresh";
  if (age < 24) return "recent";
  return "stale";
}

const CATEGORY_BONUS: Record<string, number> = { "govt.": 3, "red cross": 3, "charitable/vol": 2, private: 1 };

/**
 * Higher = call first. Requested group in stock dominates, then units, then freshness.
 * A published phone number matters in an emergency (you can't confirm stock without one).
 */
export function scoreBank(
  b: Pick<Bank, "hasRequested" | "requestedUnits" | "available" | "freshness" | "category" | "phones">,
) {
  let s = 0;
  if (b.hasRequested) s += 1000;
  if (b.hasRequested) s += b.requestedUnits === null ? 5 : Math.min(b.requestedUnits, 50) * 10;
  else if (b.available) s += 100;
  s += { fresh: 60, recent: 30, unknown: 0, stale: -40 }[b.freshness];
  if (b.phones.length > 0) s += 25;
  s += CATEGORY_BONUS[b.category.toLowerCase()] ?? 0;
  return s;
}

export function toBank(
  raw: RawBank,
  ctx: { group: BloodGroup; district: string; component: string; now: Date },
  index: number,
): Bank {
  const { available, units } = parseAvailability(raw.availability_text);
  const requested = units[ctx.group];
  const hasRequested = requested !== undefined && (requested === null || requested > 0);
  const age = ageHours(raw.last_updated, ctx.now);
  const fresh = freshness(age);
  const category = (raw.category ?? "").trim() || "Unknown";
  const b: Bank = {
    id: `${ctx.district}-${ctx.component}-${index}-${raw.bank_name.slice(0, 24)}`,
    name: raw.bank_name.replace(/\s+/g, " ").trim(),
    address: (raw.address ?? "").replace(/\s+/g, " ").trim(),
    phones: extractPhones(raw.phone),
    email: cleanEmail(raw.email),
    category,
    district: ctx.district,
    component: ctx.component,
    available,
    units,
    requestedUnits: hasRequested ? (requested ?? null) : 0,
    hasRequested,
    lastUpdated: raw.last_updated?.trim() || null,
    ageHours: age,
    freshness: fresh,
    score: 0,
  };
  b.score = scoreBank(b);
  return b;
}

export function rankBanks(
  raws: RawBank[],
  ctx: { group: BloodGroup; district: string; component: string; now: Date },
): Bank[] {
  // De-duplicate by name (agent may repeat rows when paginating).
  const seen = new Set<string>();
  const unique = raws.filter((r) => {
    const k = r.bank_name.replace(/\s+/g, " ").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.map((r, i) => toBank(r, ctx, i)).sort((a, b) => b.score - a.score);
}

export const STEP_COST_USD = 0.016;
export const estimateCost = (steps: number) => +(steps * STEP_COST_USD).toFixed(3);
