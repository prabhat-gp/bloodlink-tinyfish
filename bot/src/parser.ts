/**
 * Rule-based parser: free text → what the person needs. No AI: instant, free, predictable.
 *
 *   "need O neg platelets near HSR, urgent"  → blood · O- · platelets (ask RDP/SDP) · HSR Layout · urgent
 *   "nearest blood bank"                       → nearest · (ask location)
 *   "B+ve 2 units Koramangla"                  → blood · B+ · 2 units · Koramangala (typo fixed)
 *
 * It only extracts; the conversation (handlers.ts) decides what to ask next.
 */
import type { BloodGroup } from "../../src/lib/types";
import { findPlace, type Place } from "./areas";

export type Intent = "blood" | "nearest" | "donate" | "alerts" | "help" | "greeting" | "thanks" | "unknown";
export type GroupBase = "A" | "B" | "AB" | "O" | "Oh";

export interface Parsed {
  intent: Intent;
  /** Full group, e.g. "O-". */
  group?: BloodGroup;
  /** Letter known but sign missing ("O blood") → ask O+ / O−. Set only when `group` isn't. */
  groupBase?: GroupBase;
  /** eRaktKosh component code, e.g. "11" Whole Blood. */
  component?: string;
  /** Ambiguous component ("platelets") → ask between these codes. */
  componentChoices?: string[];
  place?: Place;
  /** "near me", "nearby": ask for a location pin. */
  nearMe: boolean;
  /** "alert me when O- is available": subscribe after showing results. */
  alertMe: boolean;
  /** A place we know but don't cover, e.g. "Chennai". */
  outside?: string;
  /** Text after "near/in" we couldn't place. */
  unknownPlace?: string;
  units?: number;
  urgent: boolean;
}

// ---------- normalising ----------

const EMOJI: [RegExp, string][] = [
  [/🅾️?/gu, "o"],
  [/🆎/gu, "ab"],
  [/🅰️?/gu, "a"],
  [/🅱️?/gu, "b"],
  [/➕/gu, "+"],
  [/➖/gu, "-"],
];

/** Lowercase, unify minus/plus look-alikes, drop punctuation (keeps + and -). */
export function normalise(input: string): string {
  let t = input;
  for (const [re, s] of EMOJI) t = t.replace(re, s);
  return t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[−‐-―﹣－]/g, "-")
    .replace(/[﹢＋]/g, "+")
    .replace(/[’'`]/g, "")
    // Subgroups: eRaktKosh only lists A/B/AB/O, so "A1+" → "A+", "A2B-" → "AB-".
    .replace(/(?<![a-z0-9])a[12](b?)(?=\s*(?:[+-]|rh|pos|neg|plus|minus))/g, "a$1")
    .replace(/[^a-z0-9+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- blood group ----------

const LETTER = "(ab|oh|a|b|o)";
const RH = "(?:\\s*rh\\s*d?)?"; // "O Rh negative", "O RhD+"
const POS_WORD = "(?:pos|poz)[a-z]{0,6}|plus";
const NEG_WORD = "(?:neg|nag|nig)[a-z]{0,6}|minus";

/** "O-", "O -ve", "AB+ve", "Oh-VE", "O Rh+" */
const SYMBOL_RE = new RegExp(`(?<![a-z0-9])${LETTER}${RH}(\\s*)([+-])(\\s*ve)?(?![a-z0-9+-])`, "g");
/** "O negative", "b positve", "o-neg", "AB plus" (needs a space or hyphen; "oh" excluded: it's also an interjection) */
const WORD_RE = new RegExp(`(?<![a-z0-9])(ab|a|b|o)${RH}(?:\\s+|\\s*-\\s*)(${POS_WORD}|${NEG_WORD})(?![a-z0-9])`, "g");
/** "oneg", "abpos", "bnegative" (exact words only, so names like "Anagha" don't match) */
const JOINED_RE = /(?<![a-z0-9])(ab|a|b|o)(pos|neg|positive|negative|plus|minus)(?![a-z0-9])/g;
/** "bombay", "bombay blood group negative", "hh" */
const BOMBAY_RE = new RegExp(
  `(?<![a-z0-9])(bombay|bombai|bombey|hh)((?:\\s+(?:blood|group|grp|type|phenotype))*)(?:\\s*([+-])(?:\\s*ve)?(?![a-z0-9])|\\s*-?\\s*(${POS_WORD}|${NEG_WORD})(?![a-z0-9]))?`,
  "g",
);
/** Letter only, from context: "blood group O", "O blood", "B group", "type AB" */
const BASE_AFTER_RE = /(?:blood\s*group|blood\s*type|group|grp|bg|type)\s*(?:is\s*)?[:=]?\s*(ab|a|b|o)(?![a-z0-9+-])/;
const BASE_BEFORE_RE = /(?<![a-z0-9])(ab|b|o)\s*(?:blood|group|grp|type|ve)(?![a-z])/;
const A_BEFORE_RE = /(?<![a-z0-9])a\s*(?:group|grp|type)(?![a-z])/; // not "a blood bank"

const toBase = (l: string): GroupBase => (l === "ab" ? "AB" : l === "oh" ? "Oh" : (l.toUpperCase() as GroupBase));
const signOf = (s: string): "+" | "-" => (/^(?:\+|pos|poz|plus)/.test(s) ? "+" : "-");

interface GroupHit {
  group?: BloodGroup;
  base?: GroupBase;
  start: number;
  end: number;
}

function findGroup(t: string): GroupHit | null {
  const hits: GroupHit[] = [];

  for (const m of t.matchAll(SYMBOL_RE)) {
    const [, letter, space, sign, ve] = m;
    // "a -" / "oh -" with a gap and no "ve" is usually prose ("need a - urgently", "oh - ok").
    if ((letter === "a" || letter === "oh") && space && !ve) continue;
    hits.push({ group: `${toBase(letter)}${sign}` as BloodGroup, start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of t.matchAll(WORD_RE)) {
    hits.push({ group: `${toBase(m[1])}${signOf(m[2])}` as BloodGroup, start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of t.matchAll(JOINED_RE)) {
    hits.push({ group: `${toBase(m[1])}${signOf(m[2])}` as BloodGroup, start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of t.matchAll(BOMBAY_RE)) {
    const [, , bloodWords, sym, word] = m;
    const sign = sym ?? (word ? signOf(word) : undefined);
    // "in Bombay" (the city) unless it clearly talks about blood.
    const before = t.slice(0, m.index).trim().split(" ").pop() ?? "";
    if (!sign && !bloodWords && /^(in|near|at|from|to|around|nr)$/.test(before)) continue;
    const start = m.index!;
    const end = start + m[0].length;
    hits.push(sign ? { group: `Oh${sign}` as BloodGroup, start, end } : { base: "Oh", start, end });
  }
  if (hits.length) {
    // First mention wins; full groups beat bare "bombay".
    hits.sort((a, b) => a.start - b.start);
    return hits.find((h) => h.group) ?? hits[0];
  }

  for (const re of [BASE_AFTER_RE, BASE_BEFORE_RE, A_BEFORE_RE]) {
    const m = t.match(re);
    if (m) return { base: toBase(m[1] ?? "a"), start: m.index!, end: m.index! + m[0].length };
  }
  const lone = t.match(/^(ab|a|b|o)$/);
  if (lone) return { base: toBase(lone[1]), start: 0, end: t.length };
  return null;
}

// ---------- component ----------

const PLATELET = /\b(?:pl[ae]+t+[ae]*l+[ae]*t+[a-z]*|plts?|plt count)\b/;

/** Most specific first. A string is one code; an array means "ask which one". */
const COMPONENT_RULES: [RegExp, string | string[]][] = [
  [/\bsagm\b/, "28"],
  [/\b(?:sdp|single donor|apheresis|aphaeresis|apharesis|jumbo)\b/, "14"],
  [/\b(?:rdp|random donor)\b/, "23"],
  [/\b(?:ffp|fresh frozen)\b/, "13"],
  [/\bcryo[a-z]*\b/, "17"],
  [/\b(?:prbc|prc|pcv|packed (?:red|rbc|cell)[a-z]*|red (?:blood )?cells?|rbcs?)\b/, "12"],
  [/\b(?:whole blood|wb)\b/, "11"],
  [PLATELET, ["23", "14"]],
  [/\bpla[sz]+ma\b/, ["13", "19"]],
];

function findComponent(t: string): { component?: string; choices?: string[] } {
  const words = t.replace(/[+-]/g, " ");
  for (const [re, code] of COMPONENT_RULES) {
    if (re.test(words)) return Array.isArray(code) ? { choices: code } : { component: code };
  }
  return {};
}

// ---------- intent and extras ----------

const RE = {
  alerts: /\b(?:my alerts?|alerts|stop alerts?|cancel alerts?|unsubscribe|stop notif[a-z]*)\b/,
  donate: /\b(?:donate|donating|donation|give blood|giving blood|be a donor|become a donor)\b/,
  nearMe: /\b(?:near me|nearby|near by|around me|close to me|closest|nearest|my location|current location|near my)\b/,
  /** Asking for blood banks themselves. */
  bank: /\b(?:blood ?banks?|blood ?bnk|blood ?cent(?:er|re)s?)\b/,
  /** Needs blood (group still unknown). */
  need: /\b(?:need[a-z]*|require[a-z]*|reqd|req|want[a-z]*|urgent[a-z]*|emergenc[a-z]*|blood|donors?|units?|khoon|khun|rakt[a-z]*|chahiye|chaiye|find|search[a-z]*|looking|stock|availab[a-z]*|patient|surgery|operation|accident|transfusion|dengue)\b/,
  /** Weak "where" words: only mean "nearest" when nothing else matched. */
  where: /\b(?:hospitals?|nearest|closest|near me|nearby|near by|around me)\b/,
  alertMe: /\b(?:alert me|notify me|let me know|inform me|tell me when|message me when)\b/,
  urgent: /\b(?:urgent[a-z]*|emergenc[a-z]*|asap|critical|immediate[a-z]*|jaldi|sos|icu|accident|serious|right now)\b/,
  help: /\b(?:help|how (?:does|do|to|it)|what (?:can|do) you|menu|commands?)\b/,
  thanks: /\b(?:thanks?|thank you|thanku|thx|tq|ty|dhanyavad[a-z]*|shukriya)\b/,
  greeting: /^(?:hi+|hello+|hey+|hai|helo|namaste|namaskar[a-z]*|good (?:morning|afternoon|evening)|yo|start)\b/,
};

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const UNITS_RE = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:units?|bottles?|bags?|pints?|packs?|pkts?|nos)\b/;

export function parse(input: string): Parsed {
  const t = normalise(input);
  const g = findGroup(t);
  // Remove the group text before looking for places, so "bombay" (the group) isn't read as Mumbai.
  const rest = g ? `${t.slice(0, g.start)} ${t.slice(g.end)}` : t;
  const { component, choices } = findComponent(rest);
  const where = findPlace(rest.replace(/[+-]/g, " "));
  const unitsM = t.match(UNITS_RE);
  const units = unitsM ? (NUM[unitsM[1]] ?? Number(unitsM[1])) : undefined;

  const has = (re: RegExp) => re.test(t);
  const wantsBlood = !!(g || component || choices);

  let intent: Intent;
  if (has(RE.alerts)) intent = "alerts";
  else if (has(RE.donate)) intent = "donate";
  else if (wantsBlood) intent = "blood";
  else if (has(RE.bank)) intent = "nearest"; // "blood bank near me"
  else if (has(RE.need)) intent = "blood"; // "need blood urgently" → ask the group
  else if (has(RE.where)) intent = "nearest"; // "hospitals near me"
  else if (where.place || where.outside || where.unknown) intent = "unknown"; // a bare place: the conversation decides
  else if (has(RE.help)) intent = "help";
  else if (has(RE.thanks)) intent = "thanks";
  else if (has(RE.greeting)) intent = "greeting";
  else intent = "unknown";

  return {
    intent,
    group: g?.group,
    groupBase: g?.group ? undefined : g?.base,
    component,
    componentChoices: choices,
    place: where.place,
    nearMe: has(RE.nearMe),
    alertMe: has(RE.alertMe),
    outside: where.place ? undefined : where.outside,
    unknownPlace: where.place ? undefined : where.unknown,
    units: units && units > 0 && units <= 20 ? units : undefined,
    urgent: has(RE.urgent),
  };
}
