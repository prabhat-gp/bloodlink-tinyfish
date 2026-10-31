/**
 * Fast eRaktKosh stock lookup: ~2 s with a warm browser, ~15–35 s when a new one has to start.
 *
 * The stock form is only a front for one data request (`nearbyBB.cnt?hmode=GETNEARBYSTOCKDETAILS`), which
 * returns EVERY bank in the district as JSON. Instead of an AI agent clicking through the form (2–4 min),
 * we open eRaktKosh once in a TinyFish remote browser (Browser API, Indian proxy) and call that request
 * from inside the page. The browser stays warm for a few minutes so the next searches take ~2 s.
 * Backup: the same request straight from our server. Last resort (in liveSearch.ts): the AI agent.
 *
 * No Playwright: a ~40-line CDP client over the built-in WebSocket (Node 22+).
 */
import { GROUP_CODES, STOCK_URL } from "../eraktkosh";
import type { RawBank, SearchQuery } from "../types";

const BROWSER_API = "https://api.browser.tinyfish.ai";
const ORIGIN = new URL(STOCK_URL).origin;
const keepWarmMin = Number(process.env.BLOODLINK_BROWSER_KEEP_WARM_MIN);
/** How long an idle browser stays open for the next search ($0.002/min while open). */
export const KEEP_WARM_MS = (Number.isFinite(keepWarmMin) && keepWarmMin > 0 ? keepWarmMin : 10) * 60_000;

export const dataPath = (q: SearchQuery) =>
  `/BLDAHIMS/bloodbank/nearbyBB.cnt?hmode=GETNEARBYSTOCKDETAILS&stateCode=${q.state}&districtCode=${q.district}` +
  `&bloodGroup=${GROUP_CODES[q.group].code}&bloodComponent=${q.component}&lang=0`;

export interface FastResult {
  banks: RawBank[];
  via: "browser" | "direct";
  ms: number;
}

const log = (...a: unknown[]) => console.log("[fastStock]", ...a);

// ---------- parsing the site's JSON ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const strip = (html: unknown) =>
  String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .trim();
const tidy = (s: string) => s.replace(/(\s*,)+/g, ",").replace(/^,|,$/g, "").trim();

/**
 * Rows look like: [sno, "Name<br/>Address<br/>Phone: 98.. ,Fax: -, Email: x", category,
 * "<p class='text-danger'><b>Whole Blood</b>Not Available …" | "<p>Available, O+Ve:3</p>", "2026-10-31 12:09:59" | <img>, type].
 * Returns null when the shape isn't what we expect (so the caller falls back).
 */
export function parseStockData(json: unknown): RawBank[] | null {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return null;
  const banks: RawBank[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 5) return null;
    const [, info, category, avail, updated] = row;
    const parts = String(info ?? "").split(/<br\s*\/?>/i);
    const name = strip(parts[0]);
    if (!name) continue;
    const contact = strip(parts.slice(2).join(" "));
    const phone = contact.match(/Phone:\s*([\d\s,+-]+?)\s*(?:,\s*Fax|,\s*Email|$)/i)?.[1]?.trim();
    const email = contact.match(/Email:\s*(\S+)/i)?.[1];
    const cat = strip(category);
    const when = strip(updated);
    banks.push({
      bank_name: name,
      address: tidy(strip(parts[1])) || undefined,
      phone: phone && /\d{6}/.test(phone) ? phone : undefined,
      email: email && email !== "-" ? email : undefined,
      category: cat && cat !== "null" ? cat : undefined,
      availability_text: strip(avail),
      // Some rows show a "live stock" icon instead of a time: we don't guess a time for those.
      last_updated: /^\d{4}-\d{2}-\d{2}/.test(when) ? when : undefined,
    });
  }
  return banks;
}

// ---------- a tiny CDP client ----------

class Cdp {
  private ws: WebSocket;
  private id = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  closed = false;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
      if (!p) return;
      this.pending.delete(msg.id!);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error("browser connection closed"));
      this.pending.clear();
    });
  }

  static connect(url: string, timeoutMs = 20_000): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => {
        ws.close();
        reject(new Error("browser connect timed out"));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(t);
        resolve(new Cdp(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(t);
        reject(new Error("browser connect failed"));
      });
    });
  }

  send<T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string, timeoutMs = 30_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error("browser connection closed"));
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(t);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.closed = true;
    this.ws.close();
  }
}

// ---------- the warm TinyFish browser ----------

interface Warm {
  sessionId: string;
  cdp: Cdp;
  page: string; // CDP session id of the eRaktKosh tab
  timer?: ReturnType<typeof setTimeout>;
}
let warm: Promise<Warm> | null = null;

function apiKey() {
  const k = process.env.TINYFISH_API_KEY?.trim();
  if (!k) throw new Error("TINYFISH_API_KEY is not set");
  return k;
}

async function evaluate<T>(w: Warm, expression: string, timeoutMs = 30_000): Promise<T> {
  const r = await w.cdp.send<{ result: { value?: T }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    w.page,
    timeoutMs,
  );
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "page script failed");
  return r.result.value as T;
}

async function openBrowser(): Promise<Warm> {
  const t0 = Date.now();
  const res = await fetch(BROWSER_API, {
    method: "POST",
    headers: { "X-API-Key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ url: STOCK_URL, timeout_seconds: Math.round(KEEP_WARM_MS / 1000) + 60, proxy_config: { enabled: true, type: "tinyfish", country_code: "IN" } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`TinyFish browser ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const { session_id, cdp_url } = (await res.json()) as { session_id: string; cdp_url: string };
  try {
    const cdp = await Cdp.connect(cdp_url);
    const { targetInfos } = await cdp.send<{ targetInfos: { targetId: string; type: string }[] }>("Target.getTargets");
    const target = targetInfos.find((t) => t.type === "page");
    if (!target) throw new Error("no page in the browser");
    const { sessionId: page } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const w: Warm = { sessionId: session_id, cdp, page };
    // Wait until eRaktKosh has loaded (the session starts navigating before it answers).
    const deadline = Date.now() + 40_000;
    let navigated = false;
    for (;;) {
      const state = await evaluate<string>(w, "location.origin + '|' + document.readyState", 10_000).catch(() => "|loading");
      const [origin, ready] = state.split("|");
      if (origin === ORIGIN && ready !== "loading") break;
      if (Date.now() > deadline) throw new Error("eRaktKosh did not load in the browser");
      if (!navigated && origin !== ORIGIN && Date.now() - t0 > 15_000) {
        navigated = true;
        await cdp.send("Page.navigate", { url: STOCK_URL }, page).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    log(`browser ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return w;
  } catch (e) {
    void closeSession(session_id);
    throw e;
  }
}

function closeSession(id: string) {
  return fetch(`${BROWSER_API}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-API-Key": apiKey() } }).catch(() => {});
}

/** Close the warm browser now (stops the per-minute meter). */
export async function closeFastBrowser() {
  const w = await warm?.catch(() => null);
  warm = null;
  if (!w) return;
  clearTimeout(w.timer);
  w.cdp.close();
  await closeSession(w.sessionId);
}

function keepWarm(w: Warm) {
  clearTimeout(w.timer);
  w.timer = setTimeout(() => void closeFastBrowser(), KEEP_WARM_MS);
  w.timer.unref?.();
}

async function getBrowser(): Promise<Warm> {
  if (warm) {
    const w = await warm.catch(() => null);
    if (w && !w.cdp.closed) return w;
    warm = null;
  }
  warm = openBrowser();
  warm.catch(() => {
    warm = null;
  });
  return warm;
}

async function viaBrowser(q: SearchQuery): Promise<RawBank[]> {
  for (let attempt = 1; ; attempt++) {
    const w = await getBrowser();
    try {
      const text = await evaluate<string>(
        w,
        `fetch(${JSON.stringify(dataPath(q))}, { credentials: "include" }).then(r => r.ok ? r.text() : Promise.reject(new Error("eRaktKosh HTTP " + r.status)))`,
      );
      keepWarm(w);
      const banks = parseStockData(JSON.parse(text));
      if (!banks) throw new Error("eRaktKosh returned an unexpected shape");
      return banks;
    } catch (e) {
      // A dead or stale browser: start a fresh one once.
      await closeFastBrowser();
      if (attempt >= 2) throw e;
      log("browser attempt failed, retrying with a new browser:", (e as Error).message);
    }
  }
}

async function viaDirect(q: SearchQuery): Promise<RawBank[]> {
  const res = await fetch(ORIGIN + dataPath(q), {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", Accept: "application/json, text/javascript, */*" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`eRaktKosh HTTP ${res.status}`);
  const banks = parseStockData(JSON.parse(await res.text()));
  if (!banks) throw new Error("eRaktKosh returned an unexpected shape");
  return banks;
}

/** Browser first (TinyFish), then a direct request. Throws if both fail; the caller then sends the AI agent. */
export async function fastStock(q: SearchQuery, signal?: AbortSignal): Promise<FastResult> {
  const t0 = Date.now();
  const race = <T>(p: Promise<T>, ms: number) =>
    Promise.race([
      p,
      new Promise<never>((_, rej) => {
        const t = setTimeout(() => rej(new Error("timed out")), ms);
        signal?.addEventListener("abort", () => (clearTimeout(t), rej(new Error("aborted"))));
      }),
    ]);
  try {
    const banks = await race(viaBrowser(q), 75_000);
    return { banks, via: "browser", ms: Date.now() - t0 };
  } catch (e) {
    if (signal?.aborted) throw e;
    log("browser path failed:", (e as Error).message);
  }
  const banks = await race(viaDirect(q), 20_000);
  return { banks, via: "direct", ms: Date.now() - t0 };
}
