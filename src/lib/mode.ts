/** "mock" (default, zero credits) or "live" (TinyFish API). */
export const MODE: "mock" | "live" = process.env.BLOODLINK_MODE === "live" ? "live" : "mock";

/** Max agent steps one browser session may spend before we refuse more runs (≈ $ cap / $0.016). */
const cap = Number(process.env.BLOODLINK_SESSION_STEP_CAP);
export const SESSION_STEP_CAP = Number.isFinite(cap) && cap > 0 ? cap : 250;
