import type { AgentEvent, SearchQuery } from "../types";
import { agentRequest, errorText, lastGood, normaliseResult, saveGood } from "./agent";
import { canSpend, recordSpend } from "./budget";
import { cancelRun, getRun, runSse, TinyFishError } from "./tinyfish";
import { fastStock } from "./fastStock";

export const EST_SEARCH_STEPS = 25;
/** TinyFish did not enforce max_duration_seconds on the first live run, so we enforce our own. */
export const SEARCH_DEADLINE_MS = 420_000;

const iso = () => new Date().toISOString();
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** "fast" (default): TinyFish browser + eRaktKosh's own data request, agent only as fallback. "agent": always the AI agent. */
export const SEARCH_MODE: "fast" | "agent" = process.env.BLOODLINK_SEARCH === "agent" ? "agent" : "fast";

/**
 * The search both the web app and the bot use. Fast path first (~2 s warm, ~15–35 s cold, no agent steps),
 * then the AI agent (2–4 min) if that fails. Pass `{ agent: true }` to show the agent on purpose.
 * Same AgentEvent stream as liveAgentRun, so callers don't change.
 */
export async function* liveStockRun(q: SearchQuery, signal: AbortSignal, opts: { agent?: boolean } = {}): AsyncGenerator<AgentEvent> {
  if (!opts.agent && SEARCH_MODE === "fast") {
    const run_id = `fast_${Date.now().toString(36)}`;
    yield { type: "STARTED", run_id, timestamp: iso() };
    yield { type: "PROGRESS", run_id, purpose: "Opening eRaktKosh in a TinyFish browser", timestamp: iso() };
    try {
      const r = await fastStock(q, signal);
      if (signal.aborted) return;
      await saveGood(q, r.banks);
      yield { type: "PROGRESS", run_id, purpose: `Read ${r.banks.length} blood banks from eRaktKosh in ${(r.ms / 1000).toFixed(1)} s`, timestamp: iso() };
      yield { type: "COMPLETE", run_id, status: "COMPLETED", result: { status: "success", banks: r.banks }, steps: 0, source: "live", timestamp: iso() };
      return;
    } catch (e) {
      if (signal.aborted) return;
      console.warn("[liveStockRun] fast path failed, sending the agent:", (e as Error).message);
      yield { type: "PROGRESS", run_id, purpose: "Quick lookup failed, sending the AI agent instead (2–4 min)", timestamp: iso() };
    }
  }
  yield* liveAgentRun(q, signal);
}

/**
 * Proxies TinyFish run-sse and re-emits our AgentEvent shape. On any failure it falls back
 * to the last good result for the same district + component, clearly marked as cached.
 */
export async function* liveAgentRun(q: SearchQuery, signal: AbortSignal): AsyncGenerator<AgentEvent> {
  if (!(await canSpend(EST_SEARCH_STEPS))) {
    yield fail("", "Daily spend cap reached on the server. Raise BLOODLINK_DAILY_STEP_CAP to continue.", 0);
    return;
  }

  let runId = "";
  let progressCount = 0;
  let failure: string | null = null;

  // Our own controller: aborts on the user's signal or on our deadline.
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, SEARCH_DEADLINE_MS);

  try {
    for await (const ev of runSse(agentRequest(q), ctrl.signal)) {
      const type = str(ev.type);
      runId = str(ev.run_id) ?? runId;
      if (type === "STARTED") yield { type: "STARTED", run_id: runId, timestamp: iso() };
      else if (type === "STREAMING_URL")
        yield { type: "STREAMING_URL", run_id: runId, streaming_url: str(ev.streaming_url) ?? str(ev.url) ?? null, timestamp: iso() };
      else if (type === "PROGRESS") {
        progressCount++;
        yield { type: "PROGRESS", run_id: runId, purpose: str(ev.purpose) ?? "Working…", timestamp: iso() };
      } else if (type === "HEARTBEAT") yield { type: "HEARTBEAT", timestamp: iso() };
      else if (type === "COMPLETE") {
        const steps = await stepsFor(runId, ev, progressCount);
        await recordSpend(steps);
        const result = normaliseResult(ev.result);
        if (str(ev.status) === "COMPLETED" && result?.status === "success") {
          await saveGood(q, result.banks);
          yield { type: "COMPLETE", run_id: runId, status: "COMPLETED", result, steps, source: "live", timestamp: iso() };
          return;
        }
        failure = result?.reason ?? errorText(ev.error) ?? "The agent could not read eRaktKosh.";
        yield* fallback(q, runId, failure, steps);
        return;
      }
    }
    failure = "The agent stream ended without a result.";
  } catch (e) {
    failure = timedOut
      ? "eRaktKosh took too long (over 7 minutes), so the agent was stopped."
      : e instanceof TinyFishError
        ? e.message
        : "Live search failed.";
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
  // Stream ended before COMPLETE (user left, deadline, network): stop the run, charge what it used.
  if (runId) await cancelRun(runId);
  const steps = runId ? await stepsFor(runId, {}, progressCount) : 0;
  if (steps) await recordSpend(steps);
  if (signal.aborted) return;
  yield* fallback(q, runId, failure ?? "Live search failed.", steps);
}

async function stepsFor(runId: string, ev: Record<string, unknown>, progressCount: number) {
  const inline = Number(ev.num_of_steps ?? ev.steps);
  if (Number.isFinite(inline) && inline > 0) return inline;
  if (runId) {
    try {
      const r = await getRun(runId);
      if (typeof r.num_of_steps === "number") return r.num_of_steps;
    } catch {
      /* fall through to estimate */
    }
  }
  return Math.max(progressCount, 1);
}

async function* fallback(q: SearchQuery, runId: string, reason: string, steps: number): AsyncGenerator<AgentEvent> {
  const cached = await lastGood(q);
  if (cached) {
    yield {
      type: "COMPLETE",
      run_id: runId,
      status: "COMPLETED",
      result: { status: "success", reason, banks: cached.banks },
      steps,
      source: "cache",
      cached_at: cached.at,
      timestamp: iso(),
    };
    return;
  }
  yield fail(runId, reason, steps);
}

const fail = (run_id: string, message: string, steps: number): AgentEvent => ({
  type: "COMPLETE",
  run_id,
  status: "FAILED",
  error: { message },
  steps,
  source: "live",
  timestamp: iso(),
});
