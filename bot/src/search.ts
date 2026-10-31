/**
 * searchBloodStock(): every stock lookup the bot makes goes through here.
 *  - 15-min cache: the same search again is instant and free
 *  - joins identical searches already running (5 people asking = 1 agent run)
 *  - at most 2 agent runs at once (TinyFish account limit); the rest wait in line
 * Always live: it runs the shared liveStockRun (TinyFish browser fast path, AI agent as fallback).
 */
import { NEIGHBOURS } from "../../src/lib/eraktkosh";
import { lastGood } from "../../src/lib/server/agent";
import { liveStockRun, SEARCH_DEADLINE_MS } from "../../src/lib/server/liveSearch";
import { readJson, writeJson } from "../../src/lib/server/store";
import type { AgentEvent, RawBank, SearchQuery } from "../../src/lib/types";
import { config } from "./config";
import { isPersisting } from "./store";

export interface StockResult {
  query: SearchQuery;
  ok: boolean;
  raw: RawBank[];
  /** When eRaktKosh was read (ISO). */
  checkedAt: string;
  /** "cache" = the live run failed and this is the last good result. */
  source: "live" | "cache";
  /** Served from the bot's cache, no new agent run. */
  cached: boolean;
  reason?: string;
  steps: number;
  seconds: number;
  streamingUrl?: string | null;
}

export interface Watcher {
  onQueued?(ahead: number): void;
  onStart?(): void;
  onProgress?(text: string): void;
  onStreamingUrl?(url: string): void;
}

export type Runner = (q: SearchQuery, signal: AbortSignal, opts: { agent?: boolean }) => AsyncGenerator<AgentEvent>;

const defaultRunner: Runner = (q, signal, opts) => liveStockRun(q, signal, opts);
let runner: Runner = defaultRunner;
/** Tests swap in a fast fake. */
export const setRunner = (r?: Runner) => {
  runner = r ?? defaultRunner;
};

export const keyOf = (q: SearchQuery) => `${q.state}:${q.district}:${q.component}:${q.group}`;
const iso = () => new Date().toISOString();
const ageMinutes = (r: StockResult) => (Date.now() - Date.parse(r.checkedAt)) / 60_000;

// ---------- cache (only successful runs; persisted so a restart keeps pre-warmed results) ----------

const CACHE_FILE = "bot-cache.json";
let cache: Record<string, StockResult> | null = null;

async function loadCache() {
  if (!cache) {
    const saved = isPersisting() ? await readJson<Record<string, StockResult>>(CACHE_FILE, {}) : {};
    // Only real eRaktKosh results (older demo runs were saved with source "mock").
    cache = Object.fromEntries(Object.entries(saved).filter(([, r]) => r.source === "live"));
  }
  return cache;
}
function saveCache() {
  if (isPersisting() && cache) writeJson(CACHE_FILE, cache).catch((e) => console.error("[search] cache save failed:", e));
}
export const clearCache = () => {
  cache = {};
};

/** A cached result no older than `maxAgeMinutes`, or null. */
export async function peek(q: SearchQuery, maxAgeMinutes = config.cacheTtlMinutes): Promise<StockResult | null> {
  const hit = (await loadCache())[keyOf(q)];
  // maxAgeMinutes 0 = always read eRaktKosh again.
  return hit && maxAgeMinutes > 0 && ageMinutes(hit) <= maxAgeMinutes ? { ...hit, cached: true } : null;
}

// ---------- queue: at most N agent runs at once ----------

const MAX_RUNS = Math.max(1, Number(process.env.BOT_MAX_AGENT_RUNS) || 2);
let running = 0;
const waiting: (() => void)[] = [];

async function acquire(onQueued: (ahead: number) => void) {
  if (running < MAX_RUNS) {
    running++;
    return;
  }
  onQueued(waiting.length + 1);
  await new Promise<void>((resolve) => waiting.push(resolve)); // the releasing run hands its slot over
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}
export const queueStats = () => ({ running, waiting: waiting.length, max: MAX_RUNS });

// ---------- search ----------

interface Job {
  promise: Promise<StockResult>;
  watchers: Set<Watcher>;
  started: boolean;
  streamingUrl?: string;
  progress?: string;
}
const inflight = new Map<string, Job>();

export async function searchBloodStock(
  q: SearchQuery,
  watcher?: Watcher,
  opts: { maxAgeMinutes?: number; agent?: boolean } = {},
): Promise<StockResult> {
  if (!opts.agent) {
    const hit = await peek(q, opts.maxAgeMinutes);
    if (hit) return hit;
  }
  const key = (opts.agent ? "agent:" : "") + keyOf(q);
  const running = inflight.get(key);
  if (running) {
    if (watcher) {
      running.watchers.add(watcher);
      if (running.started) watcher.onStart?.();
      if (running.streamingUrl) watcher.onStreamingUrl?.(running.streamingUrl);
      if (running.progress) watcher.onProgress?.(running.progress);
    }
    return running.promise;
  }
  const job = { watchers: new Set(watcher ? [watcher] : []), started: false } as Job;
  job.promise = run(q, job, !!opts.agent).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job.promise;
}

async function run(q: SearchQuery, job: Job, agent: boolean): Promise<StockResult> {
  const each = (f: (w: Watcher) => void) =>
    job.watchers.forEach((w) => {
      try {
        f(w);
      } catch {
        /* a broken watcher never breaks the search */
      }
    });

  await acquire((ahead) => each((w) => w.onQueued?.(ahead)));
  const t0 = Date.now();
  job.started = true;
  each((w) => w.onStart?.());

  let result: StockResult | null = null;
  // Backstop: fast path (≤ ~1.5 min) + the agent's own 7-min deadline fire first.
  try {
    for await (const ev of runner(q, AbortSignal.timeout(SEARCH_DEADLINE_MS + 120_000), { agent })) {
      if (ev.type === "STREAMING_URL" && ev.streaming_url) {
        job.streamingUrl = ev.streaming_url;
        each((w) => w.onStreamingUrl?.(ev.streaming_url!));
      } else if (ev.type === "PROGRESS") {
        job.progress = ev.purpose;
        each((w) => w.onProgress?.(ev.purpose));
      } else if (ev.type === "COMPLETE") {
        result = toResult(q, ev, t0, job.streamingUrl);
        break;
      }
    }
  } catch (e) {
    result = failed(q, e instanceof Error ? e.message : "Search failed.", t0);
  } finally {
    release();
  }
  result ??= failed(q, "The agent stopped without a result.", t0);

  if (result.ok && result.source !== "cache") {
    (await loadCache())[keyOf(q)] = { ...result, cached: false };
    saveCache();
  }
  return result;
}

function toResult(q: SearchQuery, ev: Extract<AgentEvent, { type: "COMPLETE" }>, t0: number, streamingUrl?: string): StockResult {
  const seconds = Math.round((Date.now() - t0) / 1000);
  const source = ev.source === "cache" ? "cache" : "live";
  // COMPLETED only means the browser ran. The goal itself can still have failed.
  if (ev.status !== "COMPLETED" || !ev.result || ev.result.status !== "success") {
    const reason = ev.result?.reason ?? ev.error?.message ?? "The agent could not read eRaktKosh.";
    return { query: q, ok: false, raw: [], checkedAt: iso(), source, cached: false, reason, steps: ev.steps ?? 0, seconds, streamingUrl };
  }
  return {
    query: q,
    ok: true,
    raw: ev.result.banks ?? [],
    checkedAt: source === "cache" && ev.cached_at ? ev.cached_at : iso(),
    source,
    cached: false,
    reason: source === "cache" ? ev.result.reason : undefined,
    steps: ev.steps ?? 0,
    seconds,
    streamingUrl,
  };
}

const failed = (q: SearchQuery, reason: string, t0: number): StockResult => ({
  query: q,
  ok: false,
  raw: [],
  checkedAt: iso(),
  source: "live",
  cached: false,
  reason,
  steps: 0,
  seconds: Math.round((Date.now() - t0) / 1000),
});

// ---------- blood bank list for "nearest" (free when anything is cached) ----------

/** The query used when we just need the list of banks in a district. */
export const listQuery = (district: string, state = "29"): SearchQuery => ({ state, district, component: "11", group: "O+" });

/** Any recent result for the district (banks don't move; stock shows its own time). null = needs a run. */
export async function cachedBankList(district: string, state = "29"): Promise<StockResult | null> {
  const mine = Object.values(await loadCache())
    .filter((r) => r.ok && r.query.district === district && r.query.state === state && ageMinutes(r) < 24 * 60)
    .sort(
      (a, b) =>
        Number(b.query.component === "11") - Number(a.query.component === "11") || Date.parse(b.checkedAt) - Date.parse(a.checkedAt),
    );
  if (mine[0]) return { ...mine[0], cached: true };
  // The web app's last good live result for this district (live mode only writes it).
  const lg = await lastGood({ state, district, component: "11" });
  if (lg) return { query: listQuery(district, state), ok: true, raw: lg.banks, checkedAt: lg.at, source: "live", cached: true, steps: 0, seconds: 0 };
  return null;
}

/** Same search in neighbouring districts (only when the first one found nothing). */
export function searchNearby(q: SearchQuery, watcher?: Watcher): Promise<StockResult[]> {
  const targets = (NEIGHBOURS[q.district] ?? []).slice(0, 5);
  return Promise.all(targets.map((district) => searchBloodStock({ ...q, district }, watcher)));
}
