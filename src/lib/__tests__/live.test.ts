import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../types";

// In-memory store + scripted TinyFish client: these tests never touch the network or .data/.
const files = new Map<string, unknown>();
vi.mock("../server/store", () => ({
  readJson: async (name: string, fallback: unknown) => (files.has(name) ? structuredClone(files.get(name)) : fallback),
  writeJson: async (name: string, data: unknown) => void files.set(name, structuredClone(data)),
}));

let script: Record<string, unknown>[] = [];
let throwAfter: number | null = null;
const cancelled: string[] = [];
vi.mock("../server/tinyfish", () => ({
  TinyFishError: class extends Error {},
  getRun: async () => ({ status: "COMPLETED", num_of_steps: 21 }),
  cancelRun: async (id: string) => void cancelled.push(id),
  async *runSse() {
    for (const [i, ev] of script.entries()) {
      if (throwAfter !== null && i >= throwAfter) throw new Error("socket closed");
      yield ev;
    }
  },
}));

const { liveAgentRun } = await import("../server/liveSearch");
const { normaliseResult, OUTPUT_SCHEMA } = await import("../server/agent");
const { toCamps } = await import("../server/camps");

const q = { group: "O-" as const, component: "11", district: "572", state: "29" };
const bank = { bank_name: "Test Bank", availability_text: "Available, O-Ve:2" };

async function collect() {
  const out: AgentEvent[] = [];
  for await (const ev of liveAgentRun(q, new AbortController().signal)) out.push(ev);
  return out;
}
const complete = (evs: AgentEvent[]) => evs.at(-1) as Extract<AgentEvent, { type: "COMPLETE" }>;

beforeEach(() => {
  files.clear();
  script = [];
  throwAfter = null;
});

describe("liveAgentRun", () => {
  it("maps TinyFish events, records spend, caches the good result", async () => {
    script = [
      { type: "STARTED", run_id: "r1" },
      { type: "STREAMING_URL", run_id: "r1", streaming_url: "https://stream.example/r1" },
      { type: "PROGRESS", run_id: "r1", purpose: "Selecting district" },
      { type: "COMPLETE", run_id: "r1", status: "COMPLETED", result: { status: "success", banks: [bank] } },
    ];
    const evs = await collect();
    expect(evs.map((e) => e.type)).toEqual(["STARTED", "STREAMING_URL", "PROGRESS", "COMPLETE"]);
    expect(evs[1]).toMatchObject({ streaming_url: "https://stream.example/r1" });
    expect(complete(evs)).toMatchObject({ status: "COMPLETED", source: "live", steps: 21 });
    expect((files.get("budget.json") as { steps: number }).steps).toBe(21);
    expect(files.get("search-cache.json")).toHaveProperty("29:572:11");
  });

  it("COMPLETED with a failed goal falls back to the last good result, labelled as cache", async () => {
    files.set("search-cache.json", { "29:572:11": { at: "2026-10-31T03:00:00Z", banks: [bank] } });
    script = [{ type: "COMPLETE", run_id: "r2", status: "COMPLETED", result: { status: "failure", reason: "Captcha shown", banks: [] } }];
    const c = complete(await collect());
    expect(c).toMatchObject({ status: "COMPLETED", source: "cache", cached_at: "2026-10-31T03:00:00Z" });
    expect(c.result?.reason).toBe("Captcha shown");
  });

  it("a dropped stream with no cache is an honest failure", async () => {
    script = [{ type: "STARTED", run_id: "r3" }, { type: "PROGRESS", purpose: "x" }];
    throwAfter = 1;
    const c = complete(await collect());
    expect(c.status).toBe("FAILED");
    expect(c.error?.message).toBeTruthy();
    // The orphaned run is cancelled so it stops spending.
    expect(cancelled).toContain("r3");
  });

  it("refuses to start when the daily cap is used up", async () => {
    files.set("budget.json", { day: new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10), steps: 10_000, runs: 1 });
    script = [{ type: "STARTED", run_id: "never" }];
    const evs = await collect();
    expect(evs).toHaveLength(1);
    expect(complete(evs).error?.message).toMatch(/cap/i);
  });
});

describe("agent result handling", () => {
  it("normalises object, JSON string and bare array results; drops malformed rows", () => {
    expect(normaliseResult({ status: "success", banks: [bank, { foo: 1 }] })?.banks).toHaveLength(1);
    expect(normaliseResult(JSON.stringify({ status: "success", banks: [bank] }))?.status).toBe("success");
    expect(normaliseResult([bank])?.banks).toHaveLength(1);
    expect(normaliseResult("not json")).toBeNull();
    expect(normaliseResult(null)).toBeNull();
  });

  it("output_schema only uses keywords TinyFish accepts", () => {
    const allowed = new Set(["anyOf", "enum", "format", "items", "maxItems", "maximum", "minItems", "minimum", "nullable", "properties", "propertyOrdering", "required", "type"]);
    const walk = (node: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(node)) {
        expect(allowed.has(k), `keyword ${k}`).toBe(true);
        if (k === "properties") Object.values(v as object).forEach((p) => walk(p as Record<string, unknown>));
        if (k === "items") walk(v as Record<string, unknown>);
      }
    };
    walk(OUTPUT_SCHEMA);
    expect(OUTPUT_SCHEMA.type).toBe("object");
  });

  it("camps: keeps blood-related hits, dedupes, never invents dates", () => {
    const camps = toCamps([
      { position: 1, title: "Blood donation camp at Jayanagar", url: "https://a.in/1", snippet: "Sunday" },
      { position: 2, title: "Blood donation camp at Jayanagar", url: "https://a.in/1" },
      { position: 3, title: "Cricket scores", url: "https://b.in/2" },
    ]);
    expect(camps).toHaveLength(1);
    expect(camps[0].date).toBe("");
    expect(camps[0].organiser).toBe("a.in");
  });
});
