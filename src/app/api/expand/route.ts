import { expandTargets } from "@/lib/expand";
import { mockRows } from "@/lib/mock/engine";
import { MODE } from "@/lib/mode";
import { rankBanks } from "@/lib/parse";
import { agentRequest, errorText, normaliseResult, saveGood } from "@/lib/server/agent";
import { canSpend, recordSpend } from "@/lib/server/budget";
import { getRun, runAsync, TERMINAL, TinyFishError } from "@/lib/server/tinyfish";
import type { ExpandResult, ExpandTarget, SearchQuery } from "@/lib/types";
import { parseQuery } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EST_STEPS_PER_TARGET = 20;
const POLL_MS = 4000;
const DEADLINE_MS = 240_000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseQuery(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const q = parsed.query;
  const targets = expandTargets(q.district, q.component);
  if (MODE === "live") return live(q, targets, req.signal);

  await new Promise((r) => setTimeout(r, 1800)); // mimic parallel run latency
  const now = new Date();
  const results: ExpandResult[] = targets.map((t, i) => {
    if (body.simulate === "fail" && i === 1) return { ...t, status: "failed", banks: [], steps: 6, reason: "Site timed out" };
    // "empty" only empties the primary search, so the demo shows widening finding stock nearby.
    const banks = rankBanks(mockRows(t), { group: q.group, district: t.district, component: t.component, now });
    return { ...t, status: banks.some((b) => b.hasRequested) ? "found" : "empty", banks, steps: 16 };
  });
  return Response.json({ results, source: "mock" });
}

/** One run-async per target (in parallel), then poll GET /v1/runs/{id} until all finish. */
async function live(q: SearchQuery, targets: ExpandTarget[], signal: AbortSignal) {
  if (!(await canSpend(targets.length * EST_STEPS_PER_TARGET)))
    return Response.json({ error: "Widening would cross the daily spend cap." }, { status: 429 });

  const started = await Promise.all(
    targets.map(async (t) => {
      try {
        return { t, id: await runAsync(agentRequest({ ...q, ...t })) };
      } catch (e) {
        return { t, id: null, err: e instanceof TinyFishError ? e.message : "Could not start agent" };
      }
    }),
  );

  const results = new Map<number, ExpandResult>();
  started.forEach((s, i) => {
    if (!s.id) results.set(i, { ...s.t, status: "failed", banks: [], steps: 0, reason: s.err });
  });

  const deadline = Date.now() + DEADLINE_MS;
  while (results.size < started.length && Date.now() < deadline && !signal.aborted) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    await Promise.all(
      started.map(async (s, i) => {
        if (results.has(i) || !s.id) return;
        try {
          const run = await getRun(s.id);
          if (!TERMINAL.has(run.status)) return;
          const steps = run.num_of_steps ?? EST_STEPS_PER_TARGET;
          await recordSpend(steps);
          const r = normaliseResult(run.result);
          if (run.status !== "COMPLETED" || r?.status !== "success") {
            results.set(i, { ...s.t, status: "failed", banks: [], steps, reason: r?.reason ?? errorText(run.error) ?? "Agent failed" });
            return;
          }
          const tq = { ...q, ...s.t };
          await saveGood(tq, r.banks);
          const banks = rankBanks(r.banks, { ...tq, now: new Date() });
          results.set(i, { ...s.t, status: banks.some((b) => b.hasRequested) ? "found" : "empty", banks, steps });
        } catch {
          /* transient poll error: try again next tick */
        }
      }),
    );
  }

  const out = started.map(
    (s, i) => results.get(i) ?? { ...s.t, status: "failed" as const, banks: [], steps: 0, reason: "Still running after 4 minutes" },
  );
  return Response.json({ results: out, source: "live" });
}
