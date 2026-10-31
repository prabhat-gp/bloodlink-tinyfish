import { ALTERNATE_COMPONENTS, NEIGHBOURS } from "./eraktkosh";
import type { ExpandTarget } from "./types";

export const MAX_TARGETS = 7;

/** Neighbouring districts (same component) first, then other components in the same district. */
export function expandTargets(district: string, component: string): ExpandTarget[] {
  const byDistrict = (NEIGHBOURS[district] ?? []).map((d) => ({ district: d, component }));
  const byComponent = (ALTERNATE_COMPONENTS[component] ?? []).map((c) => ({ district, component: c }));
  return [...byDistrict, ...byComponent].slice(0, MAX_TARGETS);
}
