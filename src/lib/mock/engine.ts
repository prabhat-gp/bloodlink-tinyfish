import { componentName, districtName, GROUP_CODES, STATES } from "../eraktkosh";
import type { AgentEvent, BloodGroup, RawBank, SearchQuery } from "../types";
import { BANGALORE_URBAN_WHOLE_BLOOD, mockNeighbourRows } from "./fixtures";

/** "appear" = no stock at first, stock shows up on a later "Keep looking" check. */
export type Simulate = "none" | "empty" | "fail" | "slow" | "appear";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = () => new Date().toISOString();

const IST_MS = 5.5 * 3600_000;
const TS_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/;

function istToMs(s: string): number | null {
  const m = s.match(TS_RE);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - IST_MS : null;
}

function msToIst(ms: number): string {
  return new Date(ms + IST_MS).toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Fixture timestamps were captured at a fixed moment. Shift them so the newest row is
 * ~15 min old "now", keeping the relative gaps (so the 8-month-stale row stays stale).
 */
export function rebaseTimestamps(rows: RawBank[], now = Date.now()): RawBank[] {
  const times = rows.map((r) => (r.last_updated ? istToMs(r.last_updated) : null));
  const newest = Math.max(...times.filter((t): t is number => t !== null));
  if (!Number.isFinite(newest)) return rows;
  const shift = now - 15 * 60_000 - newest;
  return rows.map((r, i) => (times[i] === null ? r : { ...r, last_updated: msToIst(times[i]! + shift) }));
}

export function mockRows(q: Pick<SearchQuery, "district" | "component">, now = Date.now()): RawBank[] {
  if (q.district === "572" && q.component === "11") return rebaseTimestamps(BANGALORE_URBAN_WHOLE_BLOOD, now);
  const seed = Number(q.district) + Number(q.component);
  return rebaseTimestamps(mockNeighbourRows(districtName(q.district), componentName(q.component), seed), now);
}

function appearedRow(group: BloodGroup): RawBank {
  return {
    bank_name: "Rotary Blood Centre (mock: new stock)",
    address: "No 166, 3rd Floor, 5th Main, Bangalore Urban, Karnataka",
    category: "Charitable/Vol",
    availability_text: `Available, ${GROUP_CODES[group].label}:1`,
    last_updated: msToIst(Date.now() - 4 * 60_000),
  };
}

/** Emits the same event sequence as TinyFish /v1/automation/run-sse. */
export async function* mockAgentRun(q: SearchQuery, simulate: Simulate = "none"): AsyncGenerator<AgentEvent> {
  const run_id = `mock_${Math.random().toString(36).slice(2, 10)}`;
  const pace = simulate === "slow" ? 2200 : 700;
  yield { type: "STARTED", run_id, timestamp: iso() };
  await sleep(300);
  yield { type: "STREAMING_URL", run_id, streaming_url: null, timestamp: iso() };

  const steps = [
    "Opening eRaktKosh Blood Stock Availability page",
    `Selecting State "${STATES[q.state] ?? q.state}"`,
    `Selecting District "${districtName(q.district)}"`,
    `Selecting Blood Group "${GROUP_CODES[q.group].label}"`,
    `Selecting Component "${componentName(q.component)}"`,
    "Clicking Search and waiting for the results table",
    'Setting "Show entries" to the maximum',
    "Extracting every row of the table",
  ];
  for (const [i, purpose] of steps.entries()) {
    await sleep(pace);
    if (simulate === "fail" && i === 5) {
      yield {
        type: "COMPLETE",
        run_id,
        status: "COMPLETED",
        result: { status: "failure", reason: "Results table did not load (site returned an error page).", banks: [] },
        steps: i + 1,
        timestamp: iso(),
      };
      return;
    }
    yield { type: "PROGRESS", run_id, purpose, timestamp: iso() };
  }

  await sleep(pace);
  let banks = simulate === "empty" ? [] : mockRows(q);
  if (simulate === "appear") banks = [appearedRow(q.group), ...banks];
  yield {
    type: "COMPLETE",
    run_id,
    status: "COMPLETED",
    result: { status: "success", banks },
    steps: 14 + Math.min(banks.length, 10),
    timestamp: iso(),
  };
}
