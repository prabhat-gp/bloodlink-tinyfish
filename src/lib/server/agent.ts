import { buildGoal, STOCK_URL } from "../eraktkosh";
import type { RawBank, SearchQuery } from "../types";
import type { AgentRequest } from "./tinyfish";
import { readJson, writeJson } from "./store";

/** JSON Schema for the agent's answer. Only keywords TinyFish accepts (no additionalProperties/oneOf). */
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["success", "failure"] },
    reason: { type: "string", nullable: true },
    banks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bank_name: { type: "string" },
          address: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          category: { type: "string", nullable: true },
          availability_text: { type: "string" },
          last_updated: { type: "string", nullable: true },
        },
        required: ["bank_name", "availability_text"],
      },
    },
  },
  required: ["status", "banks"],
};

export function agentRequest(q: SearchQuery): AgentRequest {
  return {
    url: STOCK_URL,
    goal: buildGoal(q),
    output_schema: OUTPUT_SCHEMA,
    browser_profile: "stealth",
    proxy_config: { enabled: true, country_code: "IN" },
    agent_config: { max_duration_seconds: 400 },
  };
}

export interface AgentResult {
  status: string;
  reason?: string;
  banks: RawBank[];
}

/** The agent may hand back an object, a JSON string, or a bare array. Normalise all three. */
export function normaliseResult(raw: unknown): AgentResult | null {
  let r = raw;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return null;
    }
  }
  if (Array.isArray(r)) return { status: "success", banks: r as RawBank[] };
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (o.result && !o.banks) return normaliseResult(o.result);
  const banks = Array.isArray(o.banks)
    ? (o.banks as RawBank[]).filter((b) => b && typeof b.bank_name === "string" && typeof b.availability_text === "string")
    : [];
  return { status: String(o.status ?? (banks.length ? "success" : "failure")), reason: o.reason as string | undefined, banks };
}

export const errorText = (e: unknown) =>
  typeof e === "string" ? e : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : undefined;

// ---------- last-known-good cache ----------

const CACHE = "search-cache.json";
type Cache = Record<string, { at: string; banks: RawBank[] }>;
const cacheKey = (q: Pick<SearchQuery, "district" | "component" | "state">) => `${q.state}:${q.district}:${q.component}`;

/** Stock rows don't depend on the group asked for, so one cache entry serves every group. */
export async function saveGood(q: SearchQuery, banks: RawBank[]) {
  const c = await readJson<Cache>(CACHE, {});
  c[cacheKey(q)] = { at: new Date().toISOString(), banks };
  await writeJson(CACHE, c);
}

export async function lastGood(q: Pick<SearchQuery, "district" | "component" | "state">) {
  const c = await readJson<Cache>(CACHE, {});
  return c[cacheKey(q)] ?? null;
}
