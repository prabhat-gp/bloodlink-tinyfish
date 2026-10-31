export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Oh+", "Oh-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

/** Units per group. `null` = site says "in stock" but gives no count. */
export type Units = Partial<Record<BloodGroup, number | null>>;

export type Freshness = "fresh" | "recent" | "stale" | "unknown";

/** One row as the agent returns it (mirrors the output_schema in BLOODLINK.md). */
export interface RawBank {
  bank_name: string;
  address?: string;
  phone?: string;
  email?: string;
  category?: string;
  availability_text: string;
  last_updated?: string;
}

/** A row after our parsing + scoring. */
export interface Bank {
  id: string;
  name: string;
  address: string;
  phones: string[];
  email: string | null;
  category: string;
  district: string;
  component: string;
  available: boolean;
  units: Units;
  /** Units of the group the user asked for: number, null (in stock, count unknown) or 0. */
  requestedUnits: number | null;
  hasRequested: boolean;
  lastUpdated: string | null;
  ageHours: number | null;
  freshness: Freshness;
  score: number;
}

export interface SearchQuery {
  group: BloodGroup;
  component: string; // eRaktKosh component code, e.g. "11"
  district: string; // eRaktKosh district code, e.g. "572"
  state: string; // eRaktKosh state code, e.g. "29"
}

/** SSE events. Same shape as TinyFish run-sse so mock → live is a drop-in swap. */
export type AgentEvent =
  | { type: "STARTED"; run_id: string; timestamp: string }
  | { type: "STREAMING_URL"; run_id: string; streaming_url: string | null; timestamp: string }
  | { type: "PROGRESS"; run_id: string; purpose: string; timestamp: string }
  | { type: "HEARTBEAT"; timestamp: string }
  | {
      type: "COMPLETE";
      run_id: string;
      status: "COMPLETED" | "FAILED";
      result?: { status: string; reason?: string; banks: RawBank[] };
      error?: { message: string };
      steps?: number;
      /** Where the result came from. "cache" = live run failed, showing last good result. */
      source?: "live" | "mock" | "cache";
      cached_at?: string;
      timestamp: string;
    };

export interface SearchOutcome {
  kind: "found" | "empty" | "failed";
  banks: Bank[];
  reason?: string;
  steps: number;
  costUsd: number;
  source?: "live" | "mock" | "cache";
  cachedAt?: string;
}

export interface ExpandTarget {
  district: string;
  component: string;
}

export interface ExpandResult extends ExpandTarget {
  status: "found" | "empty" | "failed";
  banks: Bank[];
  steps: number;
  reason?: string;
}
