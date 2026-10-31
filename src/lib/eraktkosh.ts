import type { BloodGroup } from "./types";

// Form codes verified on the live site (31 Oct 2026):
// https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt

export const STOCK_URL = "https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt";

export const STATES: Record<string, string> = { "29": "Karnataka" };

export const DISTRICTS: Record<string, string> = {
  "572": "Bangalore Urban",
  "583": "Bangalore Rural",
  "584": "Ramanagara",
  "581": "Kolar",
  "582": "Chikkaballapura",
  "571": "Tumkur",
  "573": "Mandya",
  "577": "Mysore",
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
  "572": ["583", "584", "581", "582", "571"],
  "583": ["572", "584", "582", "571"],
  "584": ["572", "583", "573", "577"],
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

/** Natural-language goal for the TinyFish agent (used from Phase 3). */
export function buildGoal(q: { state: string; district: string; group: BloodGroup; component: string }) {
  return [
    "On this eRaktKosh Blood Stock Availability page:",
    `1. Select State "${STATES[q.state] ?? q.state}", District "${districtName(q.district)}", ` +
      `Blood Group "${GROUP_CODES[q.group].label}", Blood Component "${componentName(q.component)}". Click Search.`,
    '2. Wait for the results table. Set "Show entries" to the largest option so all rows are visible ' +
      "(do not click through pages one by one).",
    "3. For EVERY row extract: bank_name, address, phone, email, category, availability_text (copy exactly), last_updated.",
    "Do not click any login links. Do not open other pages.",
    'If the site shows an error or no table appears, return {"status":"failure","reason":"<what you saw>","banks":[]}.',
    'Otherwise return {"status":"success","banks":[...]}.',
  ].join("\n");
}
