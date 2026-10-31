import { COMPONENTS, DISTRICTS, STATES } from "./eraktkosh";
import { BLOOD_GROUPS, type BloodGroup, type SearchQuery } from "./types";

/** Whitelist every user input before it reaches an agent goal (prevents prompt injection via params). */
export function parseQuery(input: Record<string, unknown>): { ok: true; query: SearchQuery } | { ok: false; error: string } {
  const group = String(input.group ?? "");
  const component = String(input.component ?? "");
  const district = String(input.district ?? "");
  const state = String(input.state ?? "29");
  if (!BLOOD_GROUPS.includes(group as BloodGroup)) return { ok: false, error: "Unknown blood group" };
  if (!(component in COMPONENTS)) return { ok: false, error: "Unknown component" };
  if (!(district in DISTRICTS)) return { ok: false, error: "Unknown district" };
  if (!(state in STATES)) return { ok: false, error: "Unknown state" };
  return { ok: true, query: { group: group as BloodGroup, component, district, state } };
}
