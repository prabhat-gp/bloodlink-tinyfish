import { beforeEach, describe, expect, it } from "vitest";
import type { AgentEvent, SearchQuery } from "../../src/lib/types";
import { clearCache, peek, searchBloodStock, setRunner, type Runner } from "../src/search";
import { setPersistence } from "../src/store";

setPersistence(false);

const q: SearchQuery = { state: "29", group: "O-", component: "11", district: "572" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString();

function fake(opts: { ms?: number; fail?: boolean; throws?: boolean } = {}) {
  const s = { calls: 0, live: 0, maxLive: 0 };
  const runner: Runner = async function* (): AsyncGenerator<AgentEvent> {
    s.calls++;
    s.live++;
    s.maxLive = Math.max(s.maxLive, s.live);
    try {
      yield { type: "STARTED", run_id: "r", timestamp: ts() };
      yield { type: "STREAMING_URL", run_id: "r", streaming_url: "https://live.example/r", timestamp: ts() };
      yield { type: "PROGRESS", run_id: "r", purpose: "Selecting district", timestamp: ts() };
      await sleep(opts.ms ?? 20);
      if (opts.throws) throw new Error("network down");
      yield {
        type: "COMPLETE",
        run_id: "r",
        status: "COMPLETED",
        result: opts.fail
          ? { status: "failure", reason: "Results table did not load", banks: [] }
          : { status: "success", banks: [{ bank_name: "Bank A", availability_text: "Available, O-Ve:1" }] },
        steps: 12,
        source: "live",
        timestamp: ts(),
      };
    } finally {
      s.live--;
    }
  };
  setRunner(runner);
  return s;
}

beforeEach(() => clearCache());

describe("searchBloodStock", () => {
  it("joins identical searches that are already running", async () => {
    const s = fake({ ms: 40 });
    const [a, b, c] = await Promise.all([searchBloodStock(q), searchBloodStock(q), searchBloodStock(q)]);
    expect(s.calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a.ok).toBe(true);
  });

  it("serves the same search from cache, instantly", async () => {
    const s = fake();
    const first = await searchBloodStock(q);
    const second = await searchBloodStock(q);
    expect(s.calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.raw).toEqual(first.raw);
  });

  it("runs again when the cache is too old for the caller", async () => {
    const s = fake();
    await searchBloodStock(q);
    await sleep(5);
    await searchBloodStock(q, undefined, { maxAgeMinutes: 0 });
    expect(s.calls).toBe(2);
  });

  it("a different group is a different search", async () => {
    const s = fake();
    await searchBloodStock(q);
    await searchBloodStock({ ...q, group: "A+" });
    expect(s.calls).toBe(2);
  });

  it("never caches a failure, and passes the reason on", async () => {
    fake({ fail: true });
    const r = await searchBloodStock(q);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/did not load/);
    expect(await peek(q)).toBeNull();
  });

  it("turns a crash into a failed result", async () => {
    fake({ throws: true });
    const r = await searchBloodStock(q);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("network down");
  });

  it("never runs more than 2 agents at once", async () => {
    const s = fake({ ms: 40 });
    const queued: number[] = [];
    const districts = ["572", "583", "584", "581", "582"];
    const results = await Promise.all(
      districts.map((district) => searchBloodStock({ ...q, district }, { onQueued: (n) => queued.push(n) })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(s.calls).toBe(5);
    expect(s.maxLive).toBe(2);
    expect(queued.length).toBe(3); // three had to wait
  });

  it("tells watchers about progress and the live view", async () => {
    fake();
    const seen: string[] = [];
    await searchBloodStock(q, {
      onStart: () => seen.push("start"),
      onStreamingUrl: (u) => seen.push(u),
      onProgress: (t) => seen.push(t),
    });
    expect(seen).toEqual(["start", "https://live.example/r", "Selecting district"]);
  });
});
