import { BANGALORE_URBAN_WHOLE_BLOOD } from "@/lib/mock/fixtures";
import { MODE } from "@/lib/mode";
import { extractPhones } from "@/lib/parse";
import { readJson } from "@/lib/server/store";
import { getDataset, getDatasetRows, TinyFishError } from "@/lib/server/tinyfish";

export const dynamic = "force-dynamic";

export interface DirectoryEntry {
  name: string;
  phone: string | null;
  area: string | null;
  district: string | null;
}

const FIXTURE: DirectoryEntry[] = BANGALORE_URBAN_WHOLE_BLOOD.map((b) => ({
  name: b.bank_name,
  phone: extractPhones(b.phone)[0] ?? null,
  area: null,
  district: "Bangalore Urban",
})).filter((d) => d.phone);

/** Dataset columns are chosen by TinyFish, so match them by meaning, not exact name. */
function pick(data: Record<string, unknown>, re: RegExp) {
  const k = Object.keys(data).find((k) => re.test(k));
  const v = k ? data[k] : null;
  return v == null || v === "" ? null : String(v);
}

/** Directory of Karnataka blood banks (all districts), built once by TinyFish Datasets (`npm run setup -- dataset`). */
export async function GET() {
  if (MODE === "mock") return Response.json({ entries: FIXTURE, source: "fixture" });

  const id = process.env.TINYFISH_DATASET_ID?.trim() || (await readJson<{ id?: string }>("dataset.json", {})).id;
  if (!id) return Response.json({ entries: FIXTURE, source: "fixture", note: "No dataset yet. Run: npm run setup -- dataset" });

  try {
    const ds = await getDataset(id);
    if (ds.status !== "ready") return Response.json({ entries: FIXTURE, source: "fixture", note: `Dataset is ${ds.status}` });
    const { rows = [] } = await getDatasetRows(id, 500);
    const entries = rows
      .map(({ data }) => ({
        name: pick(data, /name|bank|centre|center/i) ?? "",
        phone: extractPhones(pick(data, /phone|contact|mobile|tel/i))[0] ?? null,
        area: pick(data, /area|locality|address|location|town|city/i),
        district: pick(data, /district/i),
      }))
      .filter((e) => e.name);
    return Response.json({ entries, source: "dataset", datasetId: id });
  } catch (e) {
    return Response.json({ entries: FIXTURE, source: "fixture", note: e instanceof TinyFishError ? e.message : "Dataset unavailable" });
  }
}
