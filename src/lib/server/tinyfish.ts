/**
 * Minimal TinyFish REST client. Server-only: the API key never reaches the browser.
 * Shapes follow docs.tinyfish.ai (read 30 Oct 2026). Every call has a timeout and
 * throws TinyFishError with a message that is safe to show in the UI.
 */

const AGENT = "https://agent.tinyfish.ai";
const SEARCH = "https://api.search.tinyfish.ai";
const FETCH = "https://api.fetch.tinyfish.ai";

export class TinyFishError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

function key() {
  const k = process.env.TINYFISH_API_KEY?.trim();
  if (!k) throw new TinyFishError("TINYFISH_API_KEY is not set in .env.local", 401);
  return k;
}

export const hasKey = () => !!process.env.TINYFISH_API_KEY?.trim();

function friendly(status: number, body: string) {
  if (status === 401 || status === 403) return "TinyFish rejected the API key.";
  if (status === 402) return "TinyFish credits are exhausted.";
  if (status === 429) return "TinyFish rate limit hit. Try again in a minute.";
  if (status >= 500) return "TinyFish is having trouble right now.";
  return `TinyFish error ${status}: ${body.slice(0, 160)}`;
}

async function call<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 30_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { "X-API-Key": key(), "Content-Type": "application/json", ...rest.headers },
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof TinyFishError) throw e;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new TinyFishError(timeout ? "TinyFish took too long to answer." : "Could not reach TinyFish.");
  }
  const text = await res.text();
  if (!res.ok) throw new TinyFishError(friendly(res.status, text), res.status);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new TinyFishError("TinyFish returned an unreadable response.", res.status);
  }
}

// ---------- Agent ----------

export interface AgentRequest {
  url: string;
  goal: string;
  output_schema?: object;
  browser_profile?: "lite" | "stealth";
  proxy_config?: { enabled: boolean; country_code?: string };
  agent_config?: { max_duration_seconds?: number };
}

export interface RunInfo {
  run_id?: string;
  id?: string;
  status: string;
  result?: unknown;
  error?: { message?: string } | string | null;
  streaming_url?: string | null;
  num_of_steps?: number;
}

/** Streams raw run-sse events (already JSON-parsed). */
export async function* runSse(body: AgentRequest, signal: AbortSignal): AsyncGenerator<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${AGENT}/v1/automation/run-sse`, {
      method: "POST",
      headers: { "X-API-Key": key(), "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof TinyFishError) throw e;
    throw new TinyFishError("Could not reach TinyFish.");
  }
  if (!res.ok || !res.body) throw new TinyFishError(friendly(res.status, await res.text().catch(() => "")), res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        yield JSON.parse(data);
      } catch {
        /* ignore keep-alive / non-JSON lines */
      }
    }
  }
}

export async function runAsync(body: AgentRequest): Promise<string> {
  const r = await call<{ run_id?: string; error?: unknown }>(`${AGENT}/v1/automation/run-async`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!r.run_id) throw new TinyFishError(typeof r.error === "string" ? r.error : "TinyFish did not start the run.");
  return r.run_id;
}

export const getRun = (id: string) => call<RunInfo>(`${AGENT}/v1/runs/${encodeURIComponent(id)}`, { timeoutMs: 15_000 });

export const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

// ---------- Search & Fetch (free) ----------

export interface SearchResult {
  position: number;
  site_name?: string;
  title: string;
  snippet?: string;
  url: string;
  date?: string;
  publisher?: string;
}

export async function search(query: string, opts: { domain_type?: "web" | "news"; recency_minutes?: number } = {}) {
  const p = new URLSearchParams({ query, location: "IN", language: "en" });
  if (opts.domain_type) p.set("domain_type", opts.domain_type);
  if (opts.recency_minutes) p.set("recency_minutes", String(opts.recency_minutes));
  const r = await call<{ results?: SearchResult[] }>(`${SEARCH}?${p}`, { timeoutMs: 20_000 });
  return r.results ?? [];
}

export interface FetchedPage {
  url: string;
  final_url?: string;
  title?: string;
  description?: string;
  text?: string;
}

export async function fetchPages(urls: string[], purpose: string) {
  return call<{ results?: FetchedPage[]; errors?: { url: string; error: string }[] }>(FETCH, {
    method: "POST",
    body: JSON.stringify({ urls: urls.slice(0, 10), format: "markdown", per_url_timeout_ms: 20_000, purpose }),
    timeoutMs: 60_000,
  });
}

// ---------- Monitor ($0.005/run) ----------

export interface MonitorRun {
  id: string;
  is_baseline?: boolean;
  results?: SearchResult[];
  errors?: unknown[];
}

export function createMonitor(body: object) {
  return call<{ monitor: { id: string; name?: string; schedule_cron?: string }; run?: MonitorRun }>(`${AGENT}/v1/monitors`, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 60_000,
  });
}

export function runMonitor(id: string) {
  return call<{ run: MonitorRun }>(`${AGENT}/v1/monitors/${encodeURIComponent(id)}/runs`, {
    method: "POST",
    body: "{}",
    timeoutMs: 60_000,
  });
}

// ---------- Datasets (beta, free, 3 runs / 24 h) ----------

export const getDataset = (id: string) =>
  call<{ id: string; status: string }>(`${AGENT}/v1/datasets/${encodeURIComponent(id)}`, { timeoutMs: 15_000 });

export const getDatasetRows = (id: string, limit = 100) =>
  call<{ columns?: string[]; rows?: { _id: string; data: Record<string, unknown> }[] }>(
    `${AGENT}/v1/datasets/${encodeURIComponent(id)}/rows?limit=${limit}`,
    { timeoutMs: 20_000 },
  );
