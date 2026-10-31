/**
 * End-to-end conversations: real bot code, fake Telegram (every API call is captured), fast fake agent.
 * Lives in *.e2e.ts so the web app's root `npm test` doesn't need the bot's packages.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";
import { mockRows } from "../../src/lib/mock/engine";
import type { AgentEvent, RawBank } from "../../src/lib/types";
import { createBot } from "../src/bot";
import { idle } from "../src/handlers";
import { clearCache, setRunner, type Runner } from "../src/search";
import { allAlerts, resetStore, setPersistence } from "../src/store";

setPersistence(false);

// ---------- fake agent ----------

const agent = { runs: 0, empty: new Set<string>(), appear: false, lastAgent: false };
const ist = (ms: number) => new Date(ms + 5.5 * 3_600_000).toISOString().replace("T", " ").slice(0, 19);
const runner: Runner = async function* (q, _signal, opts): AsyncGenerator<AgentEvent> {
  agent.runs++;
  agent.lastAgent = !!opts?.agent;
  const t = () => new Date().toISOString();
  yield { type: "STARTED", run_id: "run1", timestamp: t() };
  yield { type: "STREAMING_URL", run_id: "run1", streaming_url: "https://live.example/run1", timestamp: t() };
  yield { type: "PROGRESS", run_id: "run1", purpose: "Selecting District", timestamp: t() };
  let banks: RawBank[] = agent.empty.has(q.district) ? [] : mockRows(q);
  if (agent.appear) {
    banks = [
      {
        bank_name: "New Hope Blood Centre",
        address: "27th Main, HSR Layout, Bengaluru",
        phone: "9876543210",
        category: "Govt.",
        availability_text: "Available, O-Ve:2",
        last_updated: ist(Date.now() - 5 * 60_000),
      },
      ...banks,
    ];
  }
  yield { type: "COMPLETE", run_id: "run1", status: "COMPLETED", result: { status: "success", banks }, steps: 18, source: "live", timestamp: t() };
};

// ---------- fake Telegram ----------

interface Call {
  method: string;
  payload: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const calls: Call[] = [];
let mid = 1000;
const bot = createBot("123:TEST", {
  botInfo: {
    id: 1,
    is_bot: true,
    first_name: "BloodLink",
    username: "BloodLinkIndiaBot",
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
  } as unknown as UserFromGetMe,
});
bot.api.config.use(async (_prev, method, payload) => {
  const p = payload as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  calls.push({ method, payload: p });
  const result = method === "sendMessage" ? { message_id: ++mid, date: 0, chat: { id: p.chat_id, type: "private" }, text: p.text } : true;
  return { ok: true, result } as never;
});

const CHAT = 42;
let uid = 1;
const user = (id = CHAT) => ({ id, is_bot: false, first_name: "Tester" });
const chat = (id = CHAT) => ({ id, type: "private" as const, first_name: "Tester" });
const now = () => Math.floor(Date.now() / 1000);

function text(t: string, chatId = CHAT) {
  const entities = t.startsWith("/") ? [{ type: "bot_command", offset: 0, length: t.split(" ")[0].length }] : undefined;
  return { update_id: uid++, message: { message_id: uid, date: now(), chat: chat(chatId), from: user(chatId), text: t, entities } };
}
const location = (latitude: number, longitude: number) => ({
  update_id: uid++,
  message: { message_id: uid, date: now(), chat: chat(), from: user(), location: { latitude, longitude } },
});
const tap = (data: string) => ({
  update_id: uid++,
  callback_query: { id: String(uid), from: user(), chat_instance: "1", data, message: { message_id: 1, date: now(), chat: chat(), text: "x" } },
});

async function send(update: object) {
  calls.length = 0;
  await bot.handleUpdate(update as never);
  await idle();
  return [...calls];
}
const sent = (cs: Call[]) => cs.filter((c) => c.method === "sendMessage");
const texts = (cs: Call[]) => sent(cs).map((c) => c.payload.text as string);
const last = (cs: Call[]) => sent(cs).at(-1)!;
const buttons = (c: Call): string[] =>
  (c.payload.reply_markup?.inline_keyboard ?? []).flat().map((b: { callback_data?: string; url?: string }) => b.callback_data ?? b.url);

/** Telegram rejects messages with unknown tags or a bare "&", "<" or ">". */
function expectValidHtml(cs: Call[]) {
  for (const c of sent(cs)) {
    if (c.payload.parse_mode !== "HTML") continue;
    const t = c.payload.text as string;
    for (const m of t.matchAll(/<\/?([a-z]+)[^>]*>/g)) expect(["b", "i", "a", "u", "s", "code", "pre"]).toContain(m[1]);
    const plain = t.replace(/<[^>]+>/g, "");
    expect(plain).not.toMatch(/[<>]/);
    expect(plain).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
  }
}

beforeAll(() => setRunner(runner));
beforeEach(() => {
  resetStore();
  clearCache();
  agent.runs = 0;
  agent.empty.clear();
  agent.appear = false;
});

describe("conversation", () => {
  it("/start shows the welcome with two buttons", async () => {
    const cs = await send(text("/start"));
    expect(texts(cs)[0]).toMatch(/BloodLink/);
    expect(buttons(last(cs))).toEqual(["start:blood", "start:nearest"]);
  });

  it("one message with everything → live status, then results", async () => {
    const cs = await send(text("need O- blood near HSR"));
    expectValidHtml(cs);
    const out = texts(cs);
    expect(out[0]).toMatch(/Checking eRaktKosh for <b>O−<\/b> · Whole Blood · near HSR Layout/);
    expect(cs.some((c) => c.method === "deleteMessage")).toBe(true); // status removed when done
    const result = out.at(-1)!;
    expect(result).toMatch(/blood banks report O− in stock/);
    expect(result).toMatch(/~\d+ km/); // distances from HSR
    expect(result).toMatch(/📞 \+91/);
    expect(result).toMatch(/Call before you travel/);
    expect(result).not.toMatch(/Demo|mock/i);
    expect(buttons(last(cs))).toEqual(expect.arrayContaining(["a:O-:11:572", "r:O-:11:572", "sh:O-:11:572"]));
    expect(agent.runs).toBe(1);
  });

  it("the same search again is instant (cache), no new agent run", async () => {
    await send(text("need O- blood near HSR"));
    const cs = await send(text("O negative in koramangala"));
    expect(agent.runs).toBe(1);
    expect(texts(cs)).toHaveLength(1); // no status message, straight to results
    expect(texts(cs)[0]).toMatch(/near Koramangala/);
  });

  it("asks only for what's missing: group → place", async () => {
    let cs = await send(text("need blood urgently"));
    expect(texts(cs)[0]).toMatch(/Which blood group/);
    expect(buttons(last(cs))).toContain("g:O-");

    cs = await send(tap("g:O-"));
    expect(texts(cs)[0]).toMatch(/Where is the patient/);
    const kb = last(cs).payload.reply_markup.keyboard;
    expect(kb[0][0]).toMatchObject({ request_location: true });

    cs = await send(text("whitfield")); // typo
    expect(texts(cs)[0]).toBe("📍 Whitefield"); // reply keyboard removed
    expect(cs[0].payload.reply_markup).toEqual({ remove_keyboard: true });
    expect(texts(cs).at(-1)).toMatch(/O− · Whole Blood<\/b> · near Whitefield/);
  });

  it("letter without sign → asks positive or negative", async () => {
    let cs = await send(text("need O blood in jayanagar"));
    expect(texts(cs)[0]).toMatch(/O positive.*O negative/);
    cs = await send(tap("g:O+"));
    expect(texts(cs).at(-1)).toMatch(/O\+ · Whole Blood<\/b> · near Jayanagar/);
  });

  it("ambiguous platelets → asks RDP or SDP", async () => {
    let cs = await send(text("O- platelets near HSR"));
    expect(texts(cs)[0]).toMatch(/Which platelets/);
    expect(buttons(last(cs))).toEqual(["c:23", "c:14"]);
    cs = await send(tap("c:14"));
    expect(texts(cs).at(-1)).toMatch(/Single Donor Platelets \(SDP\)/);
  });

  it("remembers the last area", async () => {
    await send(text("O- near HSR"));
    const cs = await send(text("need B+ blood"));
    expect(texts(cs).join("\n")).not.toMatch(/Where is the patient/);
    expect(texts(cs).at(-1)).toMatch(/B\+ · Whole Blood<\/b> · near HSR Layout/);
  });

  it("a typed answer works too, and junk re-asks politely", async () => {
    await send(text("need blood"));
    let cs = await send(text("asdf"));
    expect(texts(cs)[0]).toMatch(/Please pick the blood group/);
    cs = await send(text("b negative"));
    expect(texts(cs)[0]).toMatch(/Where is the patient/);
  });

  it("nearest blood bank → asks location → closest first", async () => {
    let cs = await send(text("nearest blood bank"));
    expect(texts(cs)[0]).toMatch(/Where are you/);
    cs = await send(location(12.912, 77.645)); // HSR Layout
    expectValidHtml(cs);
    const out = texts(cs).at(-1)!;
    expect(out).toMatch(/Blood banks near you \(HSR Layout\)/);
    const kms = [...out.matchAll(/~(\d+) km/g)].map((m) => Number(m[1]));
    expect(kms.length).toBeGreaterThan(2);
    expect(kms).toEqual([...kms].sort((a, b) => a - b)); // closest first
    expect(buttons(last(cs))).toEqual(["fg:572"]);
  });

  it("a bare place shows blood banks near it", async () => {
    const cs = await send(text("Koramangala"));
    expect(texts(cs).at(-1)).toMatch(/Blood banks near Koramangala/);
  });

  it("searches anywhere in Karnataka", async () => {
    const cs = await send(text("need O+ blood in Mangalore"));
    expect(texts(cs).at(-1)).toMatch(/O\+ · Whole Blood<\/b> · near Mangaluru/);
    expect(agent.runs).toBe(1);
  });

  it("status message says how long a live search takes", async () => {
    const cs = await send(text("need AB- blood in Hubli"));
    expect(texts(cs)[0]).toMatch(/a few seconds/);
  });

  it("👀 Watch the AI agent: always a new run, with the agent flag", async () => {
    await send(text("O- near HSR"));
    expect(buttons(last(await send(text("O- near HSR"))))).toContain("ag:O-:11:572");
    const cs = await send(tap("ag:O-:11:572"));
    expect(texts(cs)[0]).toMatch(/Showing the AI agent/);
    expect(agent.runs).toBe(2);
    expect(agent.lastAgent).toBe(true);
  });

  it("outside coverage, by text or by pin", async () => {
    let cs = await send(text("need O- blood in Chennai"));
    expect(texts(cs)[0]).toMatch(/Chennai<\/b> isn't covered yet/);
    cs = await send(location(13.08, 80.27));
    expect(texts(cs)[0]).toMatch(/outside the area I cover/);
    expect(agent.runs).toBe(0);
  });

  it("nothing in stock → call list, alert, nearby districts, alternative component", async () => {
    agent.empty.add("572");
    const cs = await send(text("O- near HSR"));
    const out = texts(cs).at(-1)!;
    expect(out).toMatch(/No blood bank reports O−/);
    expect(buttons(last(cs))).toEqual(expect.arrayContaining(["a:O-:11:572", "w:O-:11:572", "alt:O-:11:572"]));

    const nearby = await send(tap("w:O-:11:572"));
    expect(texts(nearby).at(-1)).toMatch(/in nearby districts/);
    expect(texts(nearby).at(-1)).toMatch(/1 blood bank reports it[\s\S]*📍 Chikkaballapura/); // the only mock neighbour with O−

    const alt = await send(tap("alt:O-:11:572"));
    expect(texts(alt).at(-1)).toMatch(/Packed Red Cells \(PRBC\)/);
    expect(texts(alt).at(-1)).toMatch(/Ask your doctor/);
  });

  it("alert me → /checknow → notification about the new bank only", async () => {
    await send(text("O- near HSR"));
    let cs = await send(tap("a:O-:11:572"));
    expect(texts(cs)[0]).toMatch(/Alert on/);
    expect(allAlerts()).toHaveLength(1);

    agent.appear = true; // stock shows up on eRaktKosh
    cs = await send(text("/checknow"));
    expectValidHtml(cs);
    const alert = texts(cs).find((t) => t.includes("Good news"))!;
    expect(alert).toMatch(/New Hope Blood Centre/);
    expect(alert).not.toMatch(/Manipal/); // already known when the alert was set

    cs = await send(text("/checknow"));
    expect(texts(cs).join("\n")).toMatch(/nothing new yet/); // same bank isn't announced twice

    cs = await send(text("/alerts"));
    const id = allAlerts()[0].id;
    expect(buttons(last(cs))).toEqual([`x:${id}`]);
    cs = await send(tap(`x:${id}`));
    expect(texts(cs)[0]).toMatch(/Alert stopped/);
    expect(allAlerts()).toHaveLength(0);
  });

  it("\"alert me when…\" subscribes right after the results", async () => {
    const cs = await send(text("alert me when O- is available in HSR"));
    expect(texts(cs).at(-1)).toMatch(/Alert on/);
    expect(allAlerts()).toHaveLength(1);
  });

  it("share makes a plain, forwardable message with a WhatsApp button", async () => {
    await send(text("O- near HSR"));
    const cs = await send(tap("sh:O-:11:572"));
    const m = last(cs);
    expect(m.payload.parse_mode).toBeUndefined();
    expect(m.payload.text).toMatch(/O- Whole Blood needed/);
    expect(m.payload.text).toMatch(/t\.me\/BloodLinkIndiaBot|via BloodLink/);
    expect(buttons(m)[0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it("deep link from the web app: /start Oneg_11_572 and alert_ variant", async () => {
    let cs = await send(text("/start Oneg_11_572"));
    expect(texts(cs).at(-1)).toMatch(/O− · Whole Blood<\/b> · in Bangalore Urban/);
    cs = await send(text("/start alert_Oneg_11_572"));
    expect(texts(cs).at(-1)).toMatch(/Alert on/);
  });

  it("ignores forged buttons", async () => {
    for (const data of ["r:X+:11:572", "a:O-:99:572", "w:O-:11:999", "g:Z+", "c:abc", "fg:1"]) {
      const cs = await send(tap(data));
      expect(texts(cs)).toEqual([]);
    }
    expect(agent.runs).toBe(0);
  });

  it("two people asking the same thing share one agent run", async () => {
    await Promise.all([bot.handleUpdate(text("O- near HSR", 1) as never), bot.handleUpdate(text("O- in Jayanagar", 2) as never)]);
    await idle();
    expect(agent.runs).toBe(1);
  });

  it("greeting, help, thanks, unknown", async () => {
    expect(texts(await send(text("hi")))[0]).toMatch(/BloodLink/);
    expect(texts(await send(text("/help")))[0]).toMatch(/How BloodLink works/);
    expect(texts(await send(text("thanks")))[0]).toMatch(/Take care/);
    expect(texts(await send(text("qwerty")))[0]).toMatch(/didn't get that/);
  });
});
