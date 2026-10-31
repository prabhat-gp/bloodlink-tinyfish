/**
 * The conversation. Every message is parsed; we keep a small draft per chat and ask only for what's
 * missing (group → component if ambiguous → place), then search. Searches run detached so a slow
 * eRaktKosh check never blocks other chats.
 */
import { type Api, Composer, type Context } from "grammy";
import { ALTERNATE_COMPONENTS, COMPONENTS, districtName, DISTRICTS } from "../../src/lib/eraktkosh";
import { BLOOD_GROUPS, type BloodGroup, type SearchQuery } from "../../src/lib/types";
import { type Place, placeNear } from "./areas";
import { addAlert, checkAlerts, listAlerts, removeAlert } from "./alerts";
import * as F from "./format";
import { parse, type Parsed } from "./parser";
import {
  cachedBankList,
  listQuery,
  peek,
  searchBloodStock,
  searchNearby,
  type StockResult,
  type Watcher,
} from "./search";
import { type ChatState, chatState, type Draft, saveChats, type Spot } from "./store";

// ---------- background tasks ----------

const tasks = new Set<Promise<unknown>>();
function detach(p: Promise<unknown>) {
  const t: Promise<unknown> = p.catch((e) => console.error("[bot] task failed:", e)).finally(() => tasks.delete(t));
  tasks.add(t);
}
/** Resolves when every background task has finished (tests use this). */
export async function idle() {
  while (tasks.size) await Promise.all([...tasks]);
}

// ---------- helpers ----------

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };
const say = (ctx: Context, m: F.Msg) => ctx.reply(m.text, { ...HTML, reply_markup: m.keyboard });
const sendTo = (api: Api, chatId: number, m: F.Msg) => api.sendMessage(chatId, m.text, { ...HTML, reply_markup: m.keyboard });

const toSpot = (p: Place): Spot => ({ name: p.name, district: p.district, lat: p.lat, lng: p.lng, precise: p.precise });
const districtSpot = (d: string): Spot => ({ name: districtName(d), district: d, precise: false });
/** The chat's last place if it's in this district, else the district itself. */
const spotFor = (st: ChatState, district: string) => (st.spot?.district === district ? st.spot : districtSpot(district));

const DAY = 24 * 60;

/** Live progress message: edits itself (throttled), shows the live-view link, deletes itself when done. */
class Status {
  private id?: number;
  private t0 = Date.now();
  private progress = "Starting the agent…";
  private queued = 0;
  private url?: string;
  private lastEdit = 0;
  private lastText = "";
  private timer?: ReturnType<typeof setTimeout>;
  private ticker?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    private api: Api,
    private chatId: number,
    private q: SearchQuery,
    private spot: Spot | undefined,
    private nearest = false,
    private agent = false,
  ) {}

  private render() {
    const seconds = Math.round((Date.now() - this.t0) / 1000);
    return F.statusText(this.q, this.spot, { seconds, progress: this.progress, queued: this.queued, nearest: this.nearest, agent: this.agent });
  }

  async open() {
    const m = await this.api.sendMessage(this.chatId, (this.lastText = this.render()), HTML);
    this.id = m.message_id;
    this.ticker = setInterval(() => this.schedule(), 5000);
  }

  watcher: Watcher = {
    onQueued: (n) => {
      this.queued = n;
      this.schedule();
    },
    onStart: () => {
      this.queued = 0;
      this.schedule();
    },
    onProgress: (t) => {
      this.progress = t;
      this.schedule();
    },
    onStreamingUrl: (u) => {
      this.url = u;
      this.lastText = ""; // force an edit so the button appears
      this.schedule();
    },
  };

  private schedule() {
    if (this.closed || this.timer) return;
    const wait = Math.max(0, 1500 - (Date.now() - this.lastEdit)); // Telegram allows ~1 edit/s per chat
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, wait);
  }

  private async flush() {
    if (this.closed || !this.id) return;
    const text = this.render();
    if (text === this.lastText) return;
    this.lastEdit = Date.now();
    this.lastText = text;
    await this.api
      .editMessageText(this.chatId, this.id, text, { ...HTML, reply_markup: this.url ? F.watchKeyboard(this.url) : undefined })
      .catch(() => {}); // "not modified" / rate limit: the next tick catches up
  }

  async close() {
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.ticker);
    if (this.id) await this.api.deleteMessage(this.chatId, this.id).catch(() => {});
  }
}

// ---------- actions ----------

async function runSearch(
  ctx: Context,
  q: SearchQuery,
  spot: Spot | undefined,
  opts: { alertMe?: boolean; alt?: boolean; refresh?: boolean; agent?: boolean } = {},
) {
  const chatId = ctx.chat!.id;
  // Refresh = a new run unless the last one is under a minute old. Agent = always a new (showcase) run.
  let r = opts.agent ? null : await peek(q, opts.refresh ? 1 : undefined);
  if (!r) {
    const status = new Status(ctx.api, chatId, q, spot, false, opts.agent);
    await status.open();
    try {
      r = await searchBloodStock(q, status.watcher, { maxAgeMinutes: opts.refresh ? 1 : undefined, agent: opts.agent });
    } finally {
      await status.close();
    }
  }
  await sendTo(ctx.api, chatId, r.ok ? F.resultMessage(r, spot, { alt: opts.alt }) : F.failedMessage(r));
  if (opts.alertMe && r.ok) await subscribe(ctx.api, chatId, q, spot, r);
}

async function showNearest(ctx: Context, spot: Spot, donate = false) {
  const chatId = ctx.chat!.id;
  let r = await cachedBankList(spot.district);
  if (!r) {
    const q = listQuery(spot.district);
    const status = new Status(ctx.api, chatId, q, spot, true);
    await status.open();
    try {
      r = await searchBloodStock(q, status.watcher);
    } finally {
      await status.close();
    }
  }
  await sendTo(ctx.api, chatId, r.ok ? F.nearestMessage(r, spot, donate) : F.failedMessage(r));
}

async function subscribe(api: Api, chatId: number, q: SearchQuery, spot: Spot | undefined, r: StockResult | null) {
  const known = r ? F.rank(r).filter((b) => b.hasRequested).map((b) => b.name) : [];
  await sendTo(api, chatId, F.alertConfirm(addAlert(chatId, q, spot, known)));
}

async function widen(ctx: Context, q: SearchQuery, spot: Spot | undefined) {
  const chatId = ctx.chat!.id;
  const m = await ctx.api.sendMessage(chatId, `🔍 Checking nearby districts for <b>${F.groupLabel(q.group)}</b>…`, HTML);
  const results = await searchNearby(q);
  await ctx.api.deleteMessage(chatId, m.message_id).catch(() => {});
  await sendTo(ctx.api, chatId, F.nearbyMessage(q, results, spot));
}

async function fromCache(ctx: Context, q: SearchQuery, use: (r: StockResult) => Promise<unknown>) {
  const r = await peek(q, DAY);
  if (r) return use(r);
  await runSearch(ctx, q, spotFor(chatState(ctx.chat!.id), q.district));
}

// ---------- conversation ----------

function draftFrom(intent: Draft["intent"], p: Parsed): Draft {
  return {
    intent,
    group: p.group,
    groupBase: p.groupBase,
    component: p.component,
    componentChoices: p.componentChoices,
    spot: p.place ? toSpot(p.place) : undefined,
    nearMe: p.nearMe,
    alertMe: p.alertMe,
  };
}

/** Fold an answer into the draft. True if anything new was learned. */
function absorb(d: Draft, p: Parsed): boolean {
  let learned = false;
  if (p.group) {
    d.group = p.group;
    d.groupBase = undefined;
    learned = true;
  } else if (p.groupBase && !d.group) {
    d.groupBase = p.groupBase;
    learned = true;
  }
  if (p.component) {
    d.component = p.component;
    d.componentChoices = undefined;
    learned = true;
  } else if (p.componentChoices && !d.component) {
    d.componentChoices = p.componentChoices;
    learned = true;
  }
  if (p.place) {
    d.spot = toSpot(p.place);
    learned = true;
  }
  if (p.alertMe) d.alertMe = true;
  return learned;
}

async function ask(ctx: Context, st: ChatState, what: NonNullable<ChatState["awaiting"]>, again = false) {
  const d = st.draft!;
  st.awaiting = what;
  saveChats();
  if (what === "group") return say(ctx, d.groupBase && !again ? F.askSign(d.groupBase) : F.askGroup(d, again));
  if (what === "component") return say(ctx, F.askComponent(d.componentChoices!));
  st.replyKeyboard = true;
  return say(ctx, F.askPlace(d, again));
}

/** Ask for the next missing piece, or act once we have everything. */
async function proceed(ctx: Context, st: ChatState) {
  const d = st.draft!;
  if (d.intent === "blood") {
    if (!d.group) return ask(ctx, st, "group");
    if (!d.component && d.componentChoices) return ask(ctx, st, "component");
  }
  if (!d.spot && st.spot && !d.nearMe) d.spot = st.spot; // reuse the last area
  if (!d.spot) return ask(ctx, st, "place");

  const spot = d.spot;
  st.spot = spot;
  st.draft = undefined;
  st.awaiting = undefined;
  if (st.replyKeyboard) {
    st.replyKeyboard = false;
    await ctx.reply(`📍 ${spot.pin ? "Using your location" : F.esc(spot.name)}`, { reply_markup: { remove_keyboard: true } });
  }
  saveChats();

  if (d.intent === "nearest") return detach(showNearest(ctx, spot, d.donate));
  const q: SearchQuery = { state: "29", group: d.group!, component: d.component ?? "11", district: spot.district };
  detach(runSearch(ctx, q, spot, { alertMe: d.alertMe }));
}

async function onParsed(ctx: Context, st: ChatState, p: Parsed) {
  // Answering our question?
  if (st.draft && st.awaiting) {
    if (absorb(st.draft, p)) return proceed(ctx, st);
    const changedTopic = ["nearest", "donate", "alerts", "help", "greeting"].includes(p.intent);
    if (!changedTopic) {
      if (p.outside) return say(ctx, F.outside(p.outside));
      if (p.unknownPlace && st.awaiting === "place") return say(ctx, F.notFound(p.unknownPlace));
      if (p.intent === "thanks") return say(ctx, F.thanks());
      return ask(ctx, st, st.awaiting, true);
    }
  }

  st.draft = undefined;
  st.awaiting = undefined;
  const wantsSearch = p.intent === "blood" || p.intent === "nearest" || p.intent === "donate" || p.intent === "unknown";
  if (wantsSearch && p.outside && !p.place) return say(ctx, F.outside(p.outside));

  switch (p.intent) {
    case "greeting":
      return say(ctx, F.welcome());
    case "help":
      return say(ctx, F.help());
    case "thanks":
      return say(ctx, F.thanks());
    case "alerts":
      return say(ctx, F.alertsList(listAlerts(ctx.chat!.id)));
    case "blood":
    case "nearest":
      st.draft = draftFrom(p.intent, p);
      if (p.unknownPlace && !p.place) await say(ctx, F.notFound(p.unknownPlace));
      return proceed(ctx, st);
    case "donate":
      st.draft = { ...draftFrom("nearest", p), donate: true };
      return proceed(ctx, st);
    default:
      if (p.place) {
        st.draft = { intent: "nearest", spot: toSpot(p.place) }; // a bare place: show what's near it
        return proceed(ctx, st);
      }
      return say(ctx, F.didNotGet());
  }
}

// ---------- Telegram wiring ----------

export const handlers = new Composer<Context>();

handlers.command("start", async (ctx) => {
  const st = chatState(ctx.chat.id);
  st.draft = undefined;
  st.awaiting = undefined;
  saveChats();
  const deep = ctx.match ? F.parseStartPayload(ctx.match) : null;
  if (deep) return detach(runSearch(ctx, deep.query, spotFor(st, deep.query.district), { alertMe: deep.alert }));
  return say(ctx, F.welcome());
});

handlers.command("help", (ctx) => say(ctx, F.help()));
handlers.command("alerts", (ctx) => say(ctx, F.alertsList(listAlerts(ctx.chat.id))));
handlers.command("cancel", (ctx) => {
  const st = chatState(ctx.chat.id);
  st.draft = undefined;
  st.awaiting = undefined;
  saveChats();
  return ctx.reply("OK, cancelled.", { reply_markup: { remove_keyboard: true } });
});

/** Hidden: run this chat's alert checks now (a real eRaktKosh check, uses credits). */
handlers.command("checknow", async (ctx) => {
  const chatId = ctx.chat.id;
  if (!listAlerts(chatId).length) return say(ctx, { text: "You have no alerts yet. Search for blood, then tap <b>🔔 Alert me</b>." });
  await ctx.reply("🔄 Checking your alerts now…");
  detach(
    checkAlerts(ctx.api, { chatId, now: true }).then((n) => (n ? undefined : ctx.reply("Checked: nothing new yet. I'll keep watching."))),
  );
});

handlers.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return say(ctx, { text: "I don't know that command. Try /help." });
  return onParsed(ctx, chatState(ctx.chat.id), parse(text));
});

handlers.on("message:location", async (ctx) => {
  const { latitude: lat, longitude: lng } = ctx.message.location;
  const st = chatState(ctx.chat.id);
  const near = placeNear(lat, lng);
  if (!near) {
    st.replyKeyboard = false;
    saveChats();
    const m = F.locationOutside(lat, lng);
    return ctx.reply(m.text, { ...HTML, reply_markup: { remove_keyboard: true } });
  }
  const spot: Spot = { name: near.place.name, district: near.place.district, lat, lng, precise: true, pin: true };
  if (st.draft && st.awaiting === "place") st.draft.spot = spot;
  else st.draft = { intent: "nearest", spot };
  return proceed(ctx, st);
});

handlers.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const st = chatState(chatId);
  const [kind, ...rest] = ctx.callbackQuery.data.split(":");
  const arg = rest.join(":");

  switch (kind) {
    case "start":
      st.draft = arg === "nearest" ? { intent: "nearest", nearMe: true } : { intent: "blood" };
      return proceed(ctx, st);
    case "g": {
      if (!BLOOD_GROUPS.includes(arg as BloodGroup)) return;
      st.draft ??= { intent: "blood" };
      Object.assign(st.draft, { intent: "blood", group: arg as BloodGroup, groupBase: undefined });
      return proceed(ctx, st);
    }
    case "c": {
      if (!(arg in COMPONENTS)) return;
      st.draft ??= { intent: "blood" };
      Object.assign(st.draft, { component: arg, componentChoices: undefined });
      return proceed(ctx, st);
    }
    case "n": // "Not sure, show nearest blood banks"
      st.draft = { intent: "nearest", spot: st.draft?.spot };
      return proceed(ctx, st);
    case "fg": // "Find a blood group here"
      if (!(arg in DISTRICTS)) return;
      st.draft = { intent: "blood", spot: spotFor(st, arg) };
      return proceed(ctx, st);
    case "x":
      return ctx.reply(removeAlert(chatId, arg) ? "🔕 Alert stopped." : "That alert has already ended.");
  }

  // Buttons that carry a search: re-validated, never trusted.
  const q = F.fromQk(arg);
  if (!q) return;
  const spot = spotFor(st, q.district);
  switch (kind) {
    case "r":
      return detach(runSearch(ctx, q, spot, { refresh: true }));
    case "a":
    case "rn":
      return detach(peek(q, DAY).then((r) => subscribe(ctx.api, chatId, q, spot, r)));
    case "sh":
      return detach(
        fromCache(ctx, q, async (r) => {
          const text = F.shareText(r);
          await ctx.api.sendMessage(chatId, text, { reply_markup: F.shareKeyboard(text), link_preview_options: { is_disabled: true } });
        }),
      );
    case "all":
      return detach(fromCache(ctx, q, (r) => sendTo(ctx.api, chatId, F.resultMessage(r, spot, { all: true }))));
    case "w":
      return detach(widen(ctx, q, spot));
    case "ag":
      return detach(runSearch(ctx, q, spot, { agent: true }));
    case "alt": {
      const alt = ALTERNATE_COMPONENTS[q.component]?.[0];
      if (alt) return detach(runSearch(ctx, { ...q, component: alt }, spot, { alt: true }));
    }
  }
});
