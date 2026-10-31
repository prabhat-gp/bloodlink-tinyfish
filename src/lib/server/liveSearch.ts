import type { AgentEvent, SearchQuery } from "../types";
import { agentRequest, errorText, lastGood, normaliseResult, saveGood } from "./agent";
import { canSpend, recordSpend } from "./budget";
import { getRun, runSse, TinyFishError } from "./tinyfish";

export const EST_SEARCH_STEPS = 25;

const iso = () => new Date().toISOString();
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

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

  try {
    for await (const ev of runSse(agentRequest(q), signal)) {
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
    if (signal.aborted) return;
    failure = e instanceof TinyFishError ? e.message : "Live search failed.";
  }
  // Stream died before COMPLETE: charge what we saw, then fall back.
  const steps = runId ? await stepsFor(runId, {}, progressCount) : 0;
  if (steps) await recordSpend(steps);
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
