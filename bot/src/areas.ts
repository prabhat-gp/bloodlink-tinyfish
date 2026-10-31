/**
 * Places the bot understands → eRaktKosh district code + an approximate map point.
 * Used for: free text ("near HSR", "koramangla", "560102", "St John's"), location pins,
 * and bank addresses (to show "~4 km"). Coordinates are approximate (±1 km), always shown with "~".
 */

export interface Place {
  name: string;
  /** eRaktKosh district code (see src/lib/eraktkosh.ts DISTRICTS). */
  district: string;
  lat: number;
  lng: number;
  /** false for a whole city/district ("Bangalore"): fine for a stock search, too vague for distances. */
  precise: boolean;
}

const U = "572"; // Bangalore Urban
const R = "583"; // Bangalore Rural
const RM = "584"; // Ramanagara
const K = "581"; // Kolar
const C = "582"; // Chikkaballapura
const T = "571"; // Tumkur
const MD = "573"; // Mandya
const MY = "577"; // Mysore

type Row = [name: string, district: string, lat: number, lng: number, aliases?: string[]];

// Name is always an alias too. Aliases are lowercase words; spacing variants are handled by matching.
const AREAS: Row[] = [
  // ---- Bangalore Urban: central ----
  ["MG Road", U, 12.9756, 77.6066, ["m g road", "mahatma gandhi road", "brigade road", "church street", "residency road", "richmond road", "richmond town", "trinity circle", "cubbon park", "vidhana soudha", "ub city", "lavelle road"]],
  ["Majestic", U, 12.9772, 77.5713, ["kempegowda bus station", "kempegowda bus stand", "ksr railway station", "city railway station", "gandhinagar", "kbs", "majestic bus stand"]],
  ["KR Market", U, 12.9647, 77.5772, ["k r market", "city market", "victoria hospital", "bmcri", "bangalore medical college", "vani vilas", "avenue road", "chickpet"]],
  ["Chamrajpet", U, 12.9598, 77.5649, ["chamarajpet", "chamarajapete"]],
  ["Shivajinagar", U, 12.9857, 77.6057, ["shivaji nagar", "bowring", "bowring hospital", "russell market", "commercial street"]],
  ["Vasanth Nagar", U, 12.9886, 77.5937, ["vasanthnagar", "vasantnagar", "cunningham road", "palace road", "race course road", "high grounds"]],
  ["Seshadripuram", U, 12.9934, 77.5737, ["sheshadripuram"]],
  ["Malleshwaram", U, 13.0035, 77.5647, ["malleswaram", "mallesvaram", "malleswaram west", "sankey road", "kc general hospital", "k c general"]],
  ["Sadashivanagar", U, 13.0068, 77.5813, ["sadashiva nagar", "mekhri circle", "mekri circle"]],
  ["Ulsoor", U, 12.9817, 77.6286, ["halasuru", "halasur", "ulsoor lake"]],
  ["Shanthinagar", U, 12.9566, 77.5978, ["shanti nagar", "shantinagar", "shanthi nagar", "double road", "kh road"]],
  ["Lalbagh", U, 12.9507, 77.5848, ["lal bagh", "lalbagh road"]],
  ["Wilson Garden", U, 12.943, 77.597, ["wilson gardens", "nimhans", "kidwai", "kidwai hospital", "sanjay gandhi hospital", "lakkasandra", "adugodi"]],
  // ---- West ----
  ["Rajajinagar", U, 12.9915, 77.552, ["rajaji nagar", "navrang"]],
  ["Basaveshwaranagar", U, 12.9933, 77.539, ["basaveshwara nagar", "basaveswaranagar"]],
  ["Magadi Road", U, 12.975, 77.545, ["magadi main road"]],
  ["Vijayanagar", U, 12.9719, 77.5352, ["vijaya nagar", "hosahalli", "attiguppe"]],
  ["Nagarbhavi", U, 12.9606, 77.5097, ["nagarabhavi", "nagar bhavi"]],
  ["Mysore Road", U, 12.9475, 77.527, ["mysuru road", "nayandahalli"]],
  ["Kengeri", U, 12.9081, 77.4826, ["kengeri satellite town"]],
  ["RR Nagar", U, 12.9274, 77.5155, ["r r nagar", "rajarajeshwari nagar", "rajarajeswari nagar"]],
  // ---- South ----
  ["Basavanagudi", U, 12.9422, 77.5755, ["basavangudi", "gandhi bazaar", "bull temple road", "dvg road", "nr colony", "n r colony"]],
  ["Banashankari", U, 12.9255, 77.5468, ["bsk", "bank colony", "kathriguppe"]],
  ["Kumaraswamy Layout", U, 12.908, 77.562, ["ks layout", "k s layout"]],
  ["Uttarahalli", U, 12.905, 77.545, ["subramanyapura"]],
  ["Kanakapura Road", U, 12.882, 77.556, ["kanakapura main road", "konanakunte", "doddakallasandra", "talaghattapura", "thalaghattapura"]],
  ["Jayanagar", U, 12.925, 77.5938, ["jaya nagar", "jayanagara", "jayadeva", "jayadeva hospital", "tilak nagar"]],
  ["JP Nagar", U, 12.9063, 77.5857, ["j p nagar", "jayaprakash nagar", "jayaprakash narayan nagar", "puttenahalli"]],
  ["BTM Layout", U, 12.9166, 77.6101, ["btm", "btm stage", "madiwala", "maruti nagar", "silk board", "central silk board", "tavarekere"]],
  ["Bannerghatta Road", U, 12.895, 77.599, ["bannerghata road", "bannerghatta", "iimb", "iim bangalore", "fortis bannerghatta", "apollo bannerghatta", "meenakshi mall", "arekere"]],
  ["Hulimavu", U, 12.878, 77.605, ["gottigere"]],
  ["Koramangala", U, 12.9352, 77.6245, ["kormangala", "koramangla", "st johns", "st john", "st johns hospital", "sony signal", "forum mall", "ejipura", "vivek nagar", "viveknagar"]],
  ["HSR Layout", U, 12.9116, 77.6474, ["hsr", "h s r layout", "agara", "parangipalya"]],
  ["Bommanahalli", U, 12.902, 77.624, ["hosur road", "hosur main road", "garvebhavipalya", "kudlu gate", "singasandra"]],
  ["Begur", U, 12.876, 77.628, ["begur road", "hongasandra"]],
  ["Electronic City", U, 12.8452, 77.6602, ["electronics city", "e city", "ecity", "infosys electronic city"]],
  ["Bommasandra", U, 12.816, 77.694, ["narayana health", "narayana health city", "narayana hrudayalaya", "mazumdar shaw", "hebbagodi"]],
  ["Chandapura", U, 12.8, 77.71, ["chandapura circle"]],
  ["Jigani", U, 12.785, 77.638, ["jigani industrial area"]],
  ["Attibele", U, 12.778, 77.771, []],
  ["Anekal", U, 12.709, 77.695, ["anekal town"]],
  // ---- East ----
  ["Indiranagar", U, 12.9719, 77.6412, ["indira nagar", "indranagar", "hal 2nd stage", "cmh road", "defence colony"]],
  ["Domlur", U, 12.961, 77.6387, ["domlur layout", "embassy golf links", "egl"]],
  ["Old Airport Road", U, 12.96, 77.648, ["hal airport road", "hal", "murugeshpalya", "kodihalli", "vimanapura", "manipal hospital old airport road", "manipal old airport road"]],
  ["CV Raman Nagar", U, 12.985, 77.663, ["c v raman nagar", "bagmane", "new thippasandra", "thippasandra"]],
  ["Frazer Town", U, 12.998, 77.615, ["fraser town", "pulikeshi nagar", "cox town", "coles road"]],
  ["Banaswadi", U, 13.0141, 77.6518, ["banasawadi", "ramamurthy nagar", "ramamurthynagar"]],
  ["Kammanahalli", U, 13.015, 77.638, ["hrbr layout", "hrbr", "st thomas town"]],
  ["Kalyan Nagar", U, 13.028, 77.64, ["kalyananagar", "hennur", "hennur road", "nagawara", "manyata", "manyata tech park"]],
  ["KR Puram", U, 13.0076, 77.6955, ["k r puram", "krishnarajapuram", "krishnarajapura", "tin factory", "battarahalli", "old madras road"]],
  ["Mahadevapura", U, 12.9917, 77.7063, ["mahadevpura", "phoenix marketcity", "garudacharpalya", "doddanekundi"]],
  ["Hoodi", U, 12.992, 77.716, ["hoodi circle", "hoodi junction", "ayyappa nagar"]],
  ["Marathahalli", U, 12.9569, 77.7011, ["marathalli", "marthahalli", "marthalli", "marathahalli bridge", "kundalahalli", "aecs layout", "munnekollal", "spice garden"]],
  ["Brookefield", U, 12.966, 77.718, ["brookfield", "itpl road"]],
  ["Bellandur", U, 12.926, 77.6762, ["ecospace", "ecoworld", "kadubeesanahalli", "devarabeesanahalli"]],
  ["Sarjapur Road", U, 12.91, 77.687, ["sarjapura road", "sarjapur", "sarjapura", "kaikondrahalli", "carmelaram"]],
  ["Sarjapur Town", U, 12.86, 77.786, ["sarjapura town"]],
  ["Whitefield", U, 12.9698, 77.75, ["whitefeild", "whitfield", "white field", "itpl", "itpb", "hope farm", "vydehi", "vydehi hospital", "kadugodi", "channasandra", "varthur road", "nallurhalli"]],
  ["Varthur", U, 12.94, 77.747, ["gunjur", "balagere"]],
  // ---- North ----
  ["RT Nagar", U, 13.022, 77.595, ["r t nagar", "ganganagar", "cbi road", "sultanpalya"]],
  ["Hebbal", U, 13.0358, 77.597, ["hebal", "hebbal flyover", "bellary road", "ballari road", "kempapura", "aster cmi"]],
  ["Sanjaynagar", U, 13.033, 77.577, ["sanjay nagar", "rmv", "rmv 2nd stage", "new bel road", "bel road", "dollars colony"]],
  ["Mathikere", U, 13.033, 77.563, ["msr nagar", "ms ramaiah", "m s ramaiah", "ramaiah hospital", "msrit", "gokula"]],
  ["Yeshwanthpur", U, 13.0285, 77.5401, ["yeshwantpur", "yeshwanthpura", "yeshwantpura", "yesvantpur", "tumkur road", "tumakuru road", "goraguntepalya", "brigade gateway", "orion mall"]],
  ["Peenya", U, 13.0285, 77.5197, ["peenya industrial area", "dasarahalli", "t dasarahalli", "jalahalli cross", "8th mile"]],
  ["Jalahalli", U, 13.045, 77.548, ["jalahalli east", "jalahalli west", "gangamma circle", "bel circle"]],
  ["Vidyaranyapura", U, 13.079, 77.558, ["vidyaranyapuram"]],
  ["Sahakar Nagar", U, 13.062, 77.587, ["sahakara nagar", "sahakarnagar", "kodigehalli"]],
  ["Thanisandra", U, 13.056, 77.633, ["thanisandra main road", "hegde nagar", "rachenahalli"]],
  ["Jakkur", U, 13.078, 77.606, ["jakkuru"]],
  ["Yelahanka", U, 13.1007, 77.5963, ["yelhanka", "yelahanka new town", "yelahanka old town", "attur"]],
  // ---- Bangalore Rural ----
  ["Bangalore Airport", R, 13.1986, 77.7066, ["kial", "kempegowda airport", "kempegowda international airport", "bengaluru airport", "bangalore airport", "airport"]],
  ["Devanahalli", R, 13.247, 77.712, []],
  ["Doddaballapura", R, 13.292, 77.543, ["doddaballapur", "dodballapur", "doddaballapura town"]],
  ["Hoskote", R, 13.07, 77.798, ["hosakote"]],
  ["Nelamangala", R, 13.098, 77.393, []],
  // ---- Ramanagara ----
  ["Ramanagara", RM, 12.715, 77.281, ["ramanagar", "ramnagar", "ramanagaram"]],
  ["Channapatna", RM, 12.651, 77.209, ["chennapatna", "channapattana"]],
  ["Kanakapura", RM, 12.546, 77.42, ["kanakapura town"]],
  ["Magadi", RM, 12.957, 77.224, ["magadi town"]],
  ["Bidadi", RM, 12.797, 77.388, []],
  // ---- Kolar ----
  ["Kolar", K, 13.136, 78.129, ["kolar town", "kolar city"]],
  ["KGF", K, 12.955, 78.27, ["kolar gold fields", "robertsonpet", "robertsonpete"]],
  ["Malur", K, 13.004, 77.938, []],
  ["Bangarapet", K, 12.991, 78.178, ["bangarpet", "bangarapete"]],
  ["Mulbagal", K, 13.163, 78.393, ["mulbagilu"]],
  ["Srinivaspur", K, 13.338, 78.213, ["srinivasapura"]],
  // ---- Chikkaballapura ----
  ["Chikkaballapur", C, 13.435, 77.727, ["chikkaballapura", "chikballapur", "chickballapur"]],
  ["Chintamani", C, 13.4, 78.056, []],
  ["Gauribidanur", C, 13.611, 77.517, ["gowribidanur"]],
  ["Sidlaghatta", C, 13.389, 77.862, ["shidlaghatta"]],
  ["Bagepalli", C, 13.783, 77.794, []],
  ["Nandi Hills", C, 13.37, 77.683, ["nandi betta"]],
  // ---- Tumkur ----
  ["Tumakuru", T, 13.34, 77.101, ["tumkur", "tumakur", "tumkuru"]],
  ["Tiptur", T, 13.256, 76.477, []],
  ["Kunigal", T, 13.023, 77.028, []],
  ["Gubbi", T, 13.312, 76.941, []],
  ["Sira", T, 13.744, 76.904, []],
  ["Madhugiri", T, 13.66, 77.21, []],
  // ---- Mandya ----
  ["Mandya", MD, 12.522, 76.897, ["mandya town"]],
  ["Maddur", MD, 12.584, 77.044, []],
  ["Malavalli", MD, 12.386, 77.058, []],
  ["Srirangapatna", MD, 12.418, 76.693, ["srirangapattana", "srirangapatnam", "seringapatam"]],
  ["Pandavapura", MD, 12.501, 76.673, []],
  ["KR Pet", MD, 12.662, 76.489, ["k r pet", "krishnarajpet", "krishnarajapete"]],
  // ---- Mysore ----
  ["Mysuru", MY, 12.2958, 76.6394, ["mysore", "mysore city", "mysuru city"]],
  ["Nanjangud", MY, 12.12, 76.68, ["nanjangudu"]],
  ["Hunsur", MY, 12.309, 76.29, []],
  ["T Narasipur", MY, 12.21, 76.9, ["t narsipur", "tirumakudalu narasipura"]],
  ["KR Nagar", MY, 12.441, 76.382, ["k r nagar", "krishnarajanagara"]],
  ["Piriyapatna", MY, 12.336, 76.101, ["periyapatna"]],
];

/** Whole city / district names: good enough to search a district, too vague for distances. */
const BROAD: Row[] = [
  ["Bangalore", U, 12.9716, 77.5946, ["bengaluru", "blr", "bangaluru", "banglore", "bengalore", "bengalooru", "bangalor", "bangalore city", "bengaluru city", "bangalore urban", "bengaluru urban", "namma bengaluru"]],
  ["Bangalore Rural", R, 13.28, 77.6, ["bengaluru rural", "bangalore rural district"]],
];

/** Common pincodes → area (others starting 560 fall back to Bangalore). */
const PINCODES: Record<string, string> = {
  "560001": "MG Road", "560002": "KR Market", "560003": "Malleshwaram", "560004": "Basavanagudi",
  "560008": "Indiranagar", "560010": "Rajajinagar", "560011": "Jayanagar", "560017": "Old Airport Road",
  "560020": "Seshadripuram", "560022": "Yeshwanthpur", "560024": "Hebbal", "560029": "BTM Layout",
  "560032": "RT Nagar", "560034": "Koramangala", "560035": "Sarjapur Road", "560036": "KR Puram",
  "560037": "Marathahalli", "560038": "Indiranagar", "560040": "Vijayanagar", "560041": "Jayanagar",
  "560043": "Kalyan Nagar", "560047": "Koramangala", "560048": "Mahadevapura", "560054": "Mathikere",
  "560058": "Peenya", "560060": "Kengeri", "560064": "Yelahanka", "560066": "Whitefield",
  "560068": "Bommanahalli", "560070": "Banashankari", "560071": "Domlur", "560075": "CV Raman Nagar",
  "560076": "Bannerghatta Road", "560078": "JP Nagar", "560079": "Basaveshwaranagar", "560085": "Banashankari",
  "560094": "Sanjaynagar", "560097": "Vidyaranyapura", "560098": "RR Nagar", "560099": "Bommasandra",
  "560100": "Electronic City", "560102": "HSR Layout", "560103": "Bellandur",
  "562110": "Devanahalli", "562123": "Nelamangala", "562114": "Hoskote", "563101": "Kolar",
  "562101": "Chikkaballapur", "572101": "Tumakuru", "571401": "Mandya", "570001": "Mysuru",
};

/** Places we recognise but don't cover yet (eRaktKosh codes not wired). */
const OUTSIDE = [
  "chennai", "madras", "mumbai", "bombay", "delhi", "new delhi", "hyderabad", "secunderabad", "pune", "kolkata",
  "calcutta", "ahmedabad", "jaipur", "lucknow", "kochi", "cochin", "coimbatore", "goa", "hosur", "krishnagiri",
  "noida", "gurgaon", "gurugram", "chandigarh", "bhopal", "indore", "nagpur", "patna", "visakhapatnam", "vizag",
  "vijayawada", "tirupati", "vellore", "salem", "madurai", "trivandrum", "thiruvananthapuram", "kozhikode",
  "calicut", "hubli", "hubballi", "dharwad", "mangalore", "mangaluru", "udupi", "belgaum", "belagavi",
  "davangere", "davanagere", "shimoga", "shivamogga", "hassan", "chitradurga", "ballari", "bellary",
  "kalaburagi", "gulbarga", "bidar", "raichur", "bijapur", "vijayapura", "bagalkot", "gadag", "haveri",
  "karwar", "chikmagalur", "chikkamagaluru", "kodagu", "coorg", "madikeri", "chamarajanagar", "koppal",
  "yadgir", "hospet", "hosapete",
];
const OUTSIDE_NAME: Record<string, string> = { madras: "Chennai", bombay: "Mumbai", calcutta: "Kolkata", cochin: "Kochi", calicut: "Kozhikode", vizag: "Visakhapatnam" };

// ---------- index (built once) ----------

interface Alias {
  text: string; // "hsr layout"
  squashed: string; // "hsrlayout"
  place: Place;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const squash = (s: string) => s.replace(/ /g, "");

export const PLACES: Place[] = [];
const BY_NAME = new Map<string, Place>();
const ALIASES: Alias[] = [];

for (const [rows, precise] of [[AREAS, true], [BROAD, false]] as const) {
  for (const [name, district, lat, lng, aliases = []] of rows) {
    const place: Place = { name, district, lat, lng, precise };
    PLACES.push(place);
    BY_NAME.set(name, place);
    for (const a of new Set([norm(name), ...aliases.map(norm)])) ALIASES.push({ text: a, squashed: squash(a), place });
  }
}
// Longest first, so "hsr layout" wins over "hsr" and "mysore road" over "mysore".
ALIASES.sort((a, b) => b.text.length - a.text.length);
const FUZZY = ALIASES.filter((a) => a.squashed.length >= 6);

/** Words that are never place names (keeps fuzzy matching from guessing on ordinary words). */
const NOT_PLACES = new Set(
  ("blood need needed needs urgent urgently please near nearest nearby around group positive negative platelet platelets " +
    "plasma hospital hospitals bank banks centre center units patient required require available availability anyone " +
    "someone donor donors emergency location where there which would could should whole packed single random frozen " +
    "fresh cryo layout stage block sector phase main cross road nagar sir madam brother sister father mother friend " +
    "baby surgery operation accident admitted bombay looking search searching contact number phone today tomorrow " +
    "tonight morning evening immediately quickly within kindly thanks thank").split(" "),
);

// ---------- matching ----------

export interface PlaceMatch {
  place?: Place;
  /** Alias or pincode that matched (for debugging/tests). */
  matched?: string;
  /** A real place we don't cover yet, e.g. "Chennai". */
  outside?: string;
  /** Text after "near/in/at" we couldn't place, e.g. "Xyz Colony". */
  unknown?: string;
}

/** Find the place in free text. Order: pincode → exact alias → spacing variant → typo → outside → unknown. */
export function findPlace(text: string): PlaceMatch {
  const t = norm(text);
  if (!t) return {};
  const padded = ` ${t} `;

  // 1. Pincode
  const pin = t.match(/\b(5[67]\d{4})\b/)?.[1];
  if (pin) {
    const named = PINCODES[pin] && BY_NAME.get(PINCODES[pin]);
    if (named) return { place: named, matched: pin };
  }

  // 2. Exact alias as whole words. Prefer precise places, then the earliest mention, then the longest alias.
  let best: { a: Alias; pos: number } | null = null;
  for (const a of ALIASES) {
    const pos = padded.indexOf(` ${a.text} `);
    if (pos < 0) continue;
    if (!best || better(a, pos, best.a, best.pos)) best = { a, pos };
  }
  // 3. Spacing variants ("indira nagar" ↔ "indiranagar", "hsrlayout"), long aliases only.
  if (!best || !best.a.place.precise) {
    const sq = squash(t);
    for (const a of ALIASES) {
      if (!a.place.precise || a.squashed.length < 7) continue;
      const pos = sq.indexOf(a.squashed);
      if (pos >= 0) {
        best = { a, pos };
        break; // longest first
      }
    }
  }
  if (best && best.a.place.precise) return { place: best.a.place, matched: best.a.text };

  // 4. Typos ("koramangla", "whitfield", "electronic sity"): one edit for 6–8 letters, two for longer.
  const fuzzy = fuzzyPlace(t);
  if (fuzzy) return fuzzy;

  if (best) return { place: best.a.place, matched: best.a.text }; // broad: "Bangalore"
  if (pin?.startsWith("560")) return { place: BY_NAME.get("Bangalore"), matched: pin };

  // 5. Somewhere we know but don't cover
  for (const o of OUTSIDE) if (padded.includes(` ${o} `)) return { outside: OUTSIDE_NAME[o] ?? title(o) };

  // 6. "near Xyz Colony" that we couldn't place
  const m = t.match(/\b(?:near|in|at|around|from|nr|opp|opposite)\s+([a-z][a-z ]{2,40})/);
  if (m) {
    const words = m[1].split(" ").filter(Boolean);
    const kept: string[] = [];
    for (const w of words) {
      if (NOT_PLACES.has(w) || STOP.has(w)) break;
      kept.push(w);
      if (kept.length === 3) break;
    }
    if (kept.length && kept.join("").length >= 3) return { unknown: title(kept.join(" ")) };
  }
  return {};
}

const STOP = new Set("me my the a an this that our your his her their it here there of for to and or is are am urgent".split(" "));

function better(a: Alias, pos: number, b: Alias, bpos: number) {
  if (a.place.precise !== b.place.precise) return a.place.precise;
  if (pos !== bpos) return pos < bpos;
  return a.text.length > b.text.length;
}

function fuzzyPlace(t: string): PlaceMatch | null {
  const words = t.split(" ").filter((w) => /^[a-z]+$/.test(w));
  const candidates: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (!NOT_PLACES.has(words[i]) && !STOP.has(words[i])) candidates.push(words[i]);
    if (i + 1 < words.length && !STOP.has(words[i]) && !STOP.has(words[i + 1])) candidates.push(words[i] + words[i + 1]);
  }
  let best: { a: Alias; d: number } | null = null;
  for (const c of candidates) {
    if (c.length < 6) continue;
    const max = c.length >= 9 ? 2 : 1;
    for (const a of FUZZY) {
      if (Math.abs(a.squashed.length - c.length) > max) continue;
      const d = editDistance(c, a.squashed, max);
      if (d <= max && (!best || d < best.d || (d === best.d && a.place.precise && !best.a.place.precise))) best = { a, d };
    }
  }
  return best ? { place: best.a.place, matched: best.a.text } : null;
}

/** Edit distance with adjacent swaps (Damerau, OSA). Stops early once it exceeds `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  const n = a.length;
  const m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

const title = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

// ---------- location pins and bank addresses ----------

/** Straight-line distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Telegram location pin → nearest known area (and so the district). null = outside what we cover. */
export function placeNear(lat: number, lng: number, maxKm = 35): { place: Place; km: number } | null {
  let best: { place: Place; km: number } | null = null;
  for (const p of PLACES) {
    if (!p.precise) continue;
    const km = distanceKm({ lat, lng }, p);
    if (!best || km < best.km) best = { place: p, km };
  }
  return best && best.km <= maxKm ? best : null;
}

/** Bank address → its area (exact names only, no guessing). Earliest mention wins: addresses go street → area → city. */
export function placeFromAddress(address: string | null | undefined): Place | null {
  if (!address) return null;
  const padded = ` ${norm(address)} `;
  let best: { a: Alias; pos: number } | null = null;
  for (const a of ALIASES) {
    if (!a.place.precise) continue;
    const pos = padded.indexOf(` ${a.text} `);
    if (pos >= 0 && (!best || pos < best.pos || (pos === best.pos && a.text.length > best.a.text.length))) best = { a, pos };
  }
  if (best) return best.a.place;
  const pin = padded.match(/\b(5[67]\d{4})\b/)?.[1];
  return (pin && PINCODES[pin] && BY_NAME.get(PINCODES[pin])) || null;
}

export const placeByName = (name: string) => BY_NAME.get(name) ?? null;
