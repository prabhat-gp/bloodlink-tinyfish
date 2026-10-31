import { MOCK_CAMPS } from "@/lib/mock/fixtures";
import { MODE } from "@/lib/mode";
import { CAMP_QUERY, toCamps, type MonitorState } from "@/lib/server/camps";
import { readJson, writeJson } from "@/lib/server/store";
import { createMonitor, runMonitor, TinyFishError } from "@/lib/server/tinyfish";

export const dynamic = "force-dynamic";

const FILE = "monitor.json";
const SCHEDULE = "CRON_TZ=Asia/Kolkata 0 8 * * *"; // 8 AM IST daily, $0.005 per run

// Mock mode keeps its fake monitor in memory so the demo flow can be clicked for free.
let mockMonitor: MonitorState | null = null;

export async function GET() {
  const mon = MODE === "mock" ? mockMonitor : await readJson<MonitorState | null>(FILE, null);
  return Response.json({ monitor: mon, mode: MODE });
}

/** body.action: "create" (once) or "run" (run now). Both are explicit user clicks. */
export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "create" && action !== "run") return Response.json({ error: "action must be create or run" }, { status: 400 });

  if (MODE === "mock") {
    const now = new Date().toISOString();
    mockMonitor = mockMonitor
      ? { ...mockMonitor, lastRunAt: now }
      : { id: "mon_mock", name: "BloodLink camps (mock)", schedule: SCHEDULE, createdAt: now, lastRunAt: now, camps: MOCK_CAMPS };
    return Response.json({ monitor: mockMonitor });
  }

  try {
    const existing = await readJson<MonitorState | null>(FILE, null);
    if (action === "create") {
      if (existing) return Response.json({ monitor: existing });
      const r = await createMonitor({
        type: "search",
        name: "BloodLink: blood donation camps in Bengaluru",
        config: { query: CAMP_QUERY, recency_minutes: 7 * 24 * 60, result_limit: 10 },
        schedule_cron: SCHEDULE,
        purpose: "Daily list of upcoming blood donation camps in Bengaluru for BloodLink",
      });
      const mon: MonitorState = {
        id: r.monitor.id,
        name: r.monitor.name ?? "BloodLink camps",
        schedule: SCHEDULE,
        createdAt: new Date().toISOString(),
        lastRunAt: r.run ? new Date().toISOString() : undefined,
        camps: toCamps(r.run?.results ?? []),
      };
      await writeJson(FILE, mon);
      return Response.json({ monitor: mon });
    }
    if (!existing) return Response.json({ error: "Create the monitor first" }, { status: 400 });
    const r = await runMonitor(existing.id);
    const camps = toCamps(r.run.results ?? []);
    const mon = { ...existing, lastRunAt: new Date().toISOString(), camps: camps.length ? camps : existing.camps };
    await writeJson(FILE, mon);
    return Response.json({ monitor: mon });
  } catch (e) {
    return Response.json({ error: e instanceof TinyFishError ? e.message : "Monitor call failed" }, { status: 502 });
  }
}
