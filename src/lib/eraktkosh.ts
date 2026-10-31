import type { BloodGroup } from "./types";

// Form codes verified on the live site (31 Oct 2026):
// https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt

export const STOCK_URL = "https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt";

export const STATES: Record<string, string> = { "29": "Karnataka" };

/** All 31 Karnataka districts, codes as in the site's district dropdown (31 Oct 2026). */
export const DISTRICTS: Record<string, string> = {
  "556": "Bagalkot",
  "565": "Ballari",
  "583": "Bangalore Rural",
  "572": "Bangalore Urban",
  "555": "Belagavi",
  "558": "Bidar",
  "578": "Chamarajanagar",
  "582": "Chikkaballapura",
  "570": "Chikmagalur",
  "566": "Chitradurga",
  "575": "Dakshina Kannada",
  "567": "Davanagere",
  "562": "Dharwad",
  "561": "Gadag",
  "574": "Hassan",
  "564": "Haveri",
  "721": "Kalaburagi",
  "576": "Kodagu",
  "581": "Kolar",
  "560": "Koppal",
  "573": "Mandya",
  "577": "Mysore",
  "559": "Raichur",
  "584": "Ramanagara",
  "568": "Shimoga",
  "571": "Tumkur",
  "569": "Udupi",
  "563": "Uttara Kannada",
  "764": "Vijayanagara",
  "722": "Vijayapura",
  "580": "Yadgir",
};

/** Our group label → site label (as shown in the dropdown) and site code. */
export const GROUP_CODES: Record<BloodGroup, { label: string; code: string }> = {
  "A+": { label: "A+Ve", code: "11" },
  "A-": { label: "A-Ve", code: "12" },
  "B+": { label: "B+Ve", code: "13" },
  "B-": { label: "B-Ve", code: "14" },
  "O+": { label: "O+Ve", code: "15" },
  "O-": { label: "O-Ve", code: "16" },
  "AB+": { label: "AB+Ve", code: "17" },
  "AB-": { label: "AB-Ve", code: "18" },
  "Oh+": { label: "Oh+VE", code: "22" },
  "Oh-": { label: "Oh-VE", code: "23" },
};

export const COMPONENTS: Record<string, string> = {
  "11": "Whole Blood",
  "12": "Packed Red Blood Cells",
  "28": "Sagm Packed Red Blood Cells",
  "14": "Single Donor Platelet",
  "23": "Random Donor Platelets",
  "13": "Fresh Frozen Plasma",
  "19": "Plasma",
  "17": "Cryoprecipitate",
};

/** Districts to try when the first search comes back empty. */
export const NEIGHBOURS: Record<string, string[]> = {
  "556": ["722", "555", "560", "561", "559"],
  "565": ["764", "560", "559", "566"],
  "583": ["572", "584", "582", "571", "581"],
  "572": ["583", "584", "581", "582", "571"],
  "555": ["556", "562", "563", "722"],
  "558": ["721"],
  "578": ["577", "573", "584"],
  "582": ["581", "583", "572", "571"],
  "570": ["568", "574", "575", "569", "566"],
  "566": ["567", "571", "764", "565", "570"],
  "575": ["569", "576", "574", "570"],
  "567": ["566", "568", "564", "764"],
  "562": ["555", "561", "564", "563"],
  "561": ["562", "560", "556", "564", "764"],
  "574": ["570", "571", "573", "576", "575", "577"],
  "564": ["562", "568", "567", "561", "563"],
  "721": ["558", "580", "722"],
  "576": ["577", "574", "575"],
  "581": ["582", "572", "583"],
  "560": ["565", "559", "556", "561", "764"],
  "573": ["577", "584", "571", "574", "578"],
  "577": ["573", "578", "576", "574"],
  "559": ["580", "560", "565", "556"],
  "584": ["572", "583", "573", "578", "571"],
  "568": ["570", "567", "564", "563", "569"],
  "571": ["583", "572", "566", "574", "573", "582", "584"],
  "569": ["575", "568", "570", "563"],
  "563": ["555", "562", "564", "568", "569"],
  "764": ["565", "567", "566", "560", "561"],
  "722": ["556", "555", "721", "580"],
  "580": ["721", "559", "722"],
};

/**
 * Components to also try. Shown to the user as "ask your doctor if this is acceptable" —
 * BloodLink never decides substitutions.
 */
export const ALTERNATE_COMPONENTS: Record<string, string[]> = {
  "11": ["12", "28"],
  "12": ["28", "11"],
  "28": ["12", "11"],
};

export const districtName = (code: string) => DISTRICTS[code] ?? `District ${code}`;
export const componentName = (code: string) => COMPONENTS[code] ?? `Component ${code}`;

/**
 * Natural-language goal for the TinyFish agent.
 * A district table can hold ~95 banks, almost all "Not Available". Extracting every row made the agent
 * stall (first live run, 31 Oct 2026), so it filters the table with its own search box first:
 * in-stock cells read "Available, O-Ve:1", out-of-stock cells never contain "<group>:".
 */
export function buildGoal(q: { state: string; district: string; group: BloodGroup; component: string }) {
  const label = GROUP_CODES[q.group].label;
  return [
    "On this eRaktKosh Blood Stock Availability page:",
    `1. Select State "${STATES[q.state] ?? q.state}", District "${districtName(q.district)}", ` +
      `Blood Group "${label}", Blood Component "${componentName(q.component)}". Click Search.`,
    `2. Wait for the results table. Type exactly "${label}:" into the table's own "Search:" box (top right of the table) ` +
      "so only banks that have this blood in stock remain. Then set \"Show entries\" to 100.",
    "3. For each remaining row extract: bank_name, address, phone, email, category, availability_text (copy the " +
      "availability cell exactly, e.g. \"Available, O-Ve:1\"), last_updated.",
    "Do not click any login links. Do not open other pages. Do not scroll through or extract the unfiltered table.",
    'If the table says "No matching records found", return {"status":"success","banks":[]}.',
    'If the site shows an error or no table appears, return {"status":"failure","reason":"<what you saw>","banks":[]}.',
    'Otherwise return {"status":"success","banks":[...]}.',
  ].join("\n");
}
