import { STEP_COST_USD } from "../parse";
import { readJson, writeJson } from "./store";

/**
 * Server-side spend ledger (live mode). Survives reloads and restarts, unlike the
 * browser counter, and resets each IST day. Every agent run checks it first.
 */
const FILE = "budget.json";

const capEnv = Number(process.env.BLOODLINK_DAILY_STEP_CAP ?? process.env.BLOODLINK_SESSION_STEP_CAP);
export const DAILY_STEP_CAP = Number.isFinite(capEnv) && capEnv > 0 ? capEnv : 250;

interface Ledger {
  day: string;
  steps: number;
  runs: number;
}

const istDay = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

// Serialise writes so parallel widen runs can't lose updates.
let chain: Promise<unknown> = Promise.resolve();

async function load(): Promise<Ledger> {
  const l = await readJson<Ledger>(FILE, { day: istDay(), steps: 0, runs: 0 });
  return l.day === istDay() ? l : { day: istDay(), steps: 0, runs: 0 };
}

export async function budgetStatus() {
  const l = await load();
  return { used: l.steps, cap: DAILY_STEP_CAP, runs: l.runs, usd: +(l.steps * STEP_COST_USD).toFixed(3) };
}

/** True when `estSteps` more would still fit under the cap. */
export async function canSpend(estSteps: number) {
  const l = await load();
  return l.steps + estSteps <= DAILY_STEP_CAP;
}

export function recordSpend(steps: number) {
  const next = chain.then(async () => {
    const l = await load();
    await writeJson(FILE, { ...l, steps: l.steps + Math.max(0, steps), runs: l.runs + 1 });
  });
  chain = next.catch(() => {});
  return next;
}
