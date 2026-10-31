import { MOCK_CAMPS } from "@/lib/mock/fixtures";
import { MODE } from "@/lib/mode";
import { CAMP_QUERY, toCamps, type MonitorState } from "@/lib/server/camps";
import { readJson, writeJson } from "@/lib/server/store";
import { search, TinyFishError } from "@/lib/server/tinyfish";

export const dynamic = "force-dynamic";

const TTL_MS = 60 * 60_000; // Search is free but rate limited; one call per hour is plenty.

/** Camps: Monitor results if a Monitor exists, otherwise a (free) TinyFish Search, cached 1 h. */
export async function GET() {
  if (MODE === "mock") return Response.json({ camps: MOCK_CAMPS, source: "mock" });

  const mon = await readJson<MonitorState | null>("monitor.json", null);
  if (mon?.camps.length) return Response.json({ camps: mon.camps, source: "monitor", at: mon.lastRunAt ?? mon.createdAt });

  const cached = await readJson<{ at: number; camps: unknown[] } | null>("camps-search.json", null);
  if (cached && Date.now() - cached.at < TTL_MS)
    return Response.json({ camps: cached.camps, source: "search", at: new Date(cached.at).toISOString() });

  try {
    const camps = toCamps(await search(CAMP_QUERY, { recency_minutes: 14 * 24 * 60 }));
    await writeJson("camps-search.json", { at: Date.now(), camps });
    return Response.json({ camps, source: "search", at: new Date().toISOString() });
  } catch (e) {
    if (cached) return Response.json({ camps: cached.camps, source: "search", stale: true });
    return Response.json({ error: e instanceof TinyFishError ? e.message : "Search failed" }, { status: 502 });
  }
}
