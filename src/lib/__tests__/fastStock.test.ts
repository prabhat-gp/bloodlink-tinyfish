import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../types";

// Real rows from eRaktKosh's GETNEARBYSTOCKDETAILS response (31 Oct 2026).
const SAMPLE = {
  data: [
    ["1", "Sri Manyatha Blood Centre<br/>4TH F loor, Palm Arcade, No 153C, 1st Stage,, 4h Block, HBR Layout, Bangalore, Bangalore Urban, Karnataka<br/>Phone: 9880612994 ,Fax: 1234567890, Email: Srimanyathavbc@gmail.com", "Private", "<p class='text-danger'><b>Whole Blood</b>Not Available Search for another Component", "2026-10-31 12:09:59", "Blood Bank"],
    ["2", "Tejasvini Hospital Lions Blood Centre<br/>Near City Hospital, Kadri Temple Road,Mangalore, Dakshina Kannada, Karnataka<br/>Phone: 9480064323,824221790 ,Fax: -, Email: tejasvinihospital@gmail.com", "Private", "<p class='text-success'>Available, O+Ve:9</p>", "2026-10-28 11:45:52", "Blood Bank"],
    ["3", "REGIONAL BLOOD TRANSFUSION CENTRE, Govt. Wenlock District Hospital<br/>Hampanakatta Mangaluru, Dakshina Kannada, Karnataka<br/>Phone: 08242410701 ,Fax: 0, Email: dk.wenlock@gmail.com", "Govt.", "<p>Available, O+Ve:3, A+Ve:2</p>", "<img src='../hisglobal/bbpublic/images/transparent/live_stock.png'>", "Blood Bank"],
    ["4", "Jyothi Hospital Blood Bank<br/>Laila, Belthangady, Dakshina Kannada, Karnataka<br/>-", "null", "<p>Available, B+Ve:2</p>", "2026-10-31 08:18:33", "Blood Bank"],
  ],
};

const fast = { fail: false, calls: 0 };
vi.mock("../server/fastStock", async (orig) => ({
  ...(await orig<typeof import("../server/fastStock")>()),
  fastStock: async () => {
    fast.calls++;
    if (fast.fail) throw new Error("browser down");
    return { banks: [{ bank_name: "Fast Bank", availability_text: "Available, O-Ve:2" }], via: "browser", ms: 1200 };
  },
}));
const files = new Map<string, unknown>();
vi.mock("../server/store", () => ({
  readJson: async (name: string, fallback: unknown) => (files.has(name) ? files.get(name) : fallback),
  writeJson: async (name: string, data: unknown) => void files.set(name, data),
}));
const agentRuns: string[] = [];
vi.mock("../server/tinyfish", () => ({
  TinyFishError: class extends Error {},
  getRun: async () => ({ status: "COMPLETED", num_of_steps: 9 }),
  cancelRun: async () => {},
  async *runSse() {
    agentRuns.push("run");
    yield { type: "STARTED", run_id: "a1" };
    yield { type: "COMPLETE", run_id: "a1", status: "COMPLETED", result: { status: "success", banks: [{ bank_name: "Agent Bank", availability_text: "Available, O-Ve:1" }] } };
  },
}));

const { parseStockData, dataPath } = await import("../server/fastStock");
const { liveStockRun } = await import("../server/liveSearch");
const { rankBanks } = await import("../parse");

const q = { group: "O-" as const, component: "11", district: "572", state: "29" };
async function collect(opts = {}) {
  const out: AgentEvent[] = [];
  for await (const ev of liveStockRun(q, new AbortController().signal, opts)) out.push(ev);
  return out;
}
const done = (evs: AgentEvent[]) => evs.at(-1) as Extract<AgentEvent, { type: "COMPLETE" }>;

beforeEach(() => {
  fast.fail = false;
  fast.calls = 0;
  agentRuns.length = 0;
  files.clear();
});

describe("parseStockData", () => {
  const banks = parseStockData(SAMPLE)!;
  it("splits name, address, phone, email, category", () => {
    expect(banks).toHaveLength(4);
    expect(banks[0]).toEqual({
      bank_name: "Sri Manyatha Blood Centre",
      address: "4TH F loor, Palm Arcade, No 153C, 1st Stage, 4h Block, HBR Layout, Bangalore, Bangalore Urban, Karnataka",
      phone: "9880612994",
      email: "Srimanyathavbc@gmail.com",
      category: "Private",
      availability_text: "Whole Blood Not Available Search for another Component",
      last_updated: "2026-10-31 12:09:59",
    });
    expect(banks[1].phone).toBe("9480064323,824221790");
    expect(banks[3]).toMatchObject({ phone: undefined, email: undefined, category: undefined });
  });
  it("availability text works with the existing parser", () => {
    const ranked = rankBanks(banks, { group: "O+", district: "575", component: "11", now: new Date("2026-10-31T10:00:00Z") });
    expect(ranked.filter((b) => b.hasRequested).map((b) => b.name)).toEqual(
      expect.arrayContaining(["Tejasvini Hospital Lions Blood Centre", "REGIONAL BLOOD TRANSFUSION CENTRE, Govt. Wenlock District Hospital"]),
    );
    expect(ranked.find((b) => b.name.startsWith("Sri Manyatha"))?.available).toBe(false);
  });
  it("a 'live stock' icon instead of a time → no time", () => expect(banks[2].last_updated).toBeUndefined());
  it("rejects unexpected shapes", () => {
    expect(parseStockData({})).toBeNull();
    expect(parseStockData({ data: [["1", "x"]] })).toBeNull();
    expect(parseStockData({ data: [] })).toEqual([]);
  });
  it("builds the site's data URL from our codes", () =>
    expect(dataPath(q)).toBe("/BLDAHIMS/bloodbank/nearbyBB.cnt?hmode=GETNEARBYSTOCKDETAILS&stateCode=29&districtCode=572&bloodGroup=16&bloodComponent=11&lang=0"));
});

describe("liveStockRun", () => {
  it("fast path: no agent run, no agent steps, result cached", async () => {
    const evs = await collect();
    expect(done(evs)).toMatchObject({ status: "COMPLETED", source: "live", steps: 0, result: { banks: [{ bank_name: "Fast Bank" }] } });
    expect(agentRuns).toHaveLength(0);
    expect(files.get("search-cache.json")).toHaveProperty("29:572:11");
  });
  it("fast path fails → the AI agent takes over", async () => {
    fast.fail = true;
    const evs = await collect();
    expect(evs.some((e) => e.type === "PROGRESS" && /sending the AI agent/.test(e.purpose))).toBe(true);
    expect(done(evs).result?.banks[0].bank_name).toBe("Agent Bank");
    expect(agentRuns).toHaveLength(1);
  });
  it("{ agent: true } skips the fast path (showcase)", async () => {
    const evs = await collect({ agent: true });
    expect(fast.calls).toBe(0);
    expect(done(evs).result?.banks[0].bank_name).toBe("Agent Bank");
  });
});
