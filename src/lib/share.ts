import { componentName, districtName } from "./eraktkosh";
import type { Bank, BloodGroup } from "./types";

const unitsLabel = (b: Bank) =>
  b.requestedUnits === null ? "in stock (count not shown)" : `${b.requestedUnits} unit${b.requestedUnits === 1 ? "" : "s"}`;

export function shareMessage(group: BloodGroup, component: string, banks: Bank[], max = 3): string {
  const top = banks.filter((b) => b.hasRequested).slice(0, max);
  const head = `🩸 ${group} ${componentName(component)} needed`;
  if (top.length === 0) {
    return `${head}\nNo blood bank on eRaktKosh shows stock right now. Please share with donors who can help.`;
  }
  const lines = top.map((b, i) => {
    // A different component is never silently presented as what was asked for.
    const comp = b.component !== component ? ` · ⚠️ ${componentName(b.component)} (ask doctor)` : "";
    const phone = b.phones[0] ? ` · 📞 ${b.phones[0]}` : "";
    const updated = b.lastUpdated ? ` · updated ${b.lastUpdated.slice(0, 16)} IST` : "";
    return `${i + 1}. ${b.name} (${districtName(b.district)}) · ${unitsLabel(b)}${comp}${phone}${updated}`;
  });
  return [head, ...lines, "Source: eRaktKosh (Govt. of India). Call to confirm before travelling.", "via BloodLink"].join(
    "\n",
  );
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const mapsUrl = (b: Bank) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address}`.slice(0, 200))}`;
