"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { componentName, districtName } from "@/lib/eraktkosh";
import { expandTargets } from "@/lib/expand";
import { estimateCost } from "@/lib/parse";
import type { ExpandResult, ExpandTarget, SearchQuery } from "@/lib/types";
import { useAgentSearch } from "@/lib/useAgentSearch";
import { ActionsPanel } from "./ActionsPanel";
import { AgentPanel } from "./AgentPanel";
import { Features } from "./Features";
import { Alert, DropSolid, Fish } from "./icons";
import { Results } from "./Results";
import { SearchForm } from "./SearchForm";
import { SidePanel } from "./SidePanel";
import { WidenPanel } from "./WidenPanel";

const WATCH_MS_MOCK = 30_000;
const WATCH_MS_LIVE = 30 * 60_000;
const MAX_WATCH_CHECKS = 6;
/** Rough step budgets used to refuse work *before* it would cross the cap. */
const EST_SEARCH_STEPS = 25;
const EST_WIDEN_STEPS = 7 * 20;

/** Observed on eRaktKosh, Bangalore Urban, 31 Oct 2026. */
const STATS = [
  ["94", "blood banks listed in Bengaluru"],
  ["10", "had whole blood in stock"],
  ["4", "had O− whole blood"],
  ["8 mo", "since the oldest stock update"],
] as const;

interface Props {
  mock: boolean;
  stepCap: number;
  initialSteps: number;
  keyMissing: boolean;
}

export function BloodLinkApp({ mock, stepCap, initialSteps, keyMissing }: Props) {
  const [query, setQuery] = useState<SearchQuery>({ group: "O-", component: "11", district: "572", state: "29" });
  const [submitted, setSubmitted] = useState<SearchQuery | null>(null);
  const [simulate, setSimulate] = useState("none");
  const [widen, setWiden] = useState<ExpandResult[] | null>(null);
  const [widenPending, setWidenPending] = useState<ExpandTarget[] | null>(null);
  const [widenError, setWidenError] = useState<string | null>(null);
  const [stepsUsed, setStepsUsed] = useState(initialSteps);
  const [watching, setWatching] = useState(false);
  const [watchNote, setWatchNote] = useState<string | null>(null);
  const { state, progress, streamingUrl, outcome, run } = useAgentSearch();
  const watchChecks = useRef(0);
  const stepsRef = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  stepsRef.current = stepsUsed;

  const overCap = stepsUsed + EST_SEARCH_STEPS > stepCap;
  const widening = widenPending !== null;

  const search = useCallback(
    async (q: SearchQuery, sim = simulate, background = false) => {
      setSubmitted(q);
      if (!background) {
        setWiden(null);
        setWidenError(null);
        setWatching(false);
        setWatchNote(null);
        // Bring the live agent view into sight on small screens.
        requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      const o = await run(q, sim, background);
      setStepsUsed((s) => s + o.steps);
      return o;
    },
    [run, simulate],
  );

  const doWiden = useCallback(async () => {
    if (!submitted || widening) return;
    if (stepsRef.current + EST_WIDEN_STEPS > stepCap) {
      setWidenError(`Widening runs up to 7 agents (≈ $${(EST_WIDEN_STEPS * 0.016).toFixed(2)}), which would cross the spend cap.`);
      return;
    }
    setWidenPending(expandTargets(submitted.district, submitted.component));
    setWiden(null);
    setWidenError(null);
    try {
      const r = await fetch("/api/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...submitted, simulate }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const { results } = (await r.json()) as { results: ExpandResult[] };
      setWiden(results);
      setStepsUsed((s) => s + results.reduce((n, x) => n + x.steps, 0));
    } catch (e) {
      setWidenError(e instanceof Error ? e.message : "Widened search failed");
    } finally {
      setWidenPending(null);
    }
  }, [submitted, widening, simulate, stepCap]);

  // "Keep looking": re-run the same search on an interval, capped.
  useEffect(() => {
    if (!watching || !submitted) return;
    watchChecks.current = 0;
    // Alert only on *new* stock: compare against what was already on screen.
    const baseline = new Set(outcome?.banks.filter((b) => b.hasRequested).map((b) => b.name) ?? []);
    setWatchNote("Watching. First re-check soon…");
    const id = setInterval(async () => {
      watchChecks.current += 1;
      if (watchChecks.current > MAX_WATCH_CHECKS) {
        setWatching(false);
        setWatchNote(`Stopped after ${MAX_WATCH_CHECKS} checks. Nothing new appeared.`);
        return;
      }
      if (stepsRef.current + EST_SEARCH_STEPS > stepCap) {
        setWatching(false);
        setWatchNote("Stopped: the next check would cross the spend cap.");
        return;
      }
      // Demo mode: stock "appears" on the 2nd check so the alert can be shown on stage.
      const sim = mock && watchChecks.current >= 2 ? "appear" : "none";
      const o = await search(submitted, sim, true);
      const fresh = o.banks.filter((b) => b.hasRequested && !baseline.has(b.name));
      setWatchNote(
        fresh.length > 0
          ? `🔔 New ${submitted.group} stock at ${fresh.map((b) => b.name).join(", ")}. Results updated above.`
          : o.kind === "failed"
            ? `Check ${watchChecks.current}/${MAX_WATCH_CHECKS}: site didn't respond, will retry.`
            : `Check ${watchChecks.current}/${MAX_WATCH_CHECKS}: nothing new yet.`,
      );
      if (fresh.length > 0) setWatching(false);
    }, mock ? WATCH_MS_MOCK : WATCH_MS_LIVE);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching]);

  const busy = state === "running";
  const pct = Math.min(100, (stepsUsed / stepCap) * 100);

  return (
    <div className="min-h-screen">
      {/* ---------- Hero ---------- */}
      <div className="hero-bg relative overflow-hidden text-white">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="flex items-center justify-between gap-3 py-5">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-blood-600 shadow-[0_0_24px_rgb(224_16_60/0.6)]">
                <DropSolid className="h-4 w-4 text-white" />
              </span>
              <span className="text-lg font-semibold tracking-tight">BloodLink</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {mock && (
                <span className="rounded-full bg-amber-400/15 px-2.5 py-1 font-semibold text-amber-300 ring-1 ring-amber-400/30 ring-inset">
                  Demo data
                </span>
              )}
              <span
                className="hidden items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 font-medium text-white/70 ring-1 ring-white/10 ring-inset sm:inline-flex"
                title="TinyFish Web Agent costs $0.016 per step"
              >
                <span className="h-1 w-12 overflow-hidden rounded-full bg-white/15">
                  <span className={`block h-full rounded-full ${overCap ? "bg-blood-500" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="tabular-nums">
                  ${estimateCost(stepsUsed).toFixed(2)} / ${estimateCost(stepCap).toFixed(2)}
                </span>
              </span>
              <span className="hidden items-center gap-1.5 text-white/50 md:inline-flex">
                <Fish className="h-3.5 w-3.5" /> TinyFish
              </span>
            </div>
          </nav>

          <div className="grid gap-x-10 gap-y-8 pt-6 pb-14 lg:grid-cols-[1fr_440px] lg:pt-10 lg:pb-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/70 ring-1 ring-white/10 ring-inset">
                <span className="h-1.5 w-1.5 rounded-full bg-blood-500" /> Live blood stock · Karnataka
              </p>
              <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Find blood in
                <br />
                <span className="bg-gradient-to-r from-blood-400 to-[#ff8a5c] bg-clip-text text-transparent">60 seconds</span>, not hours of calls.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-white/65 sm:text-lg">
                Families call blood bank after blood bank in an emergency. BloodLink sends an AI agent to the
                government&apos;s eRaktKosh portal, reads every bank and ranks who actually has your group.
              </p>
            </div>
            {/* Form sits between headline and stats on phones, to the right on desktop. */}
            <div className="text-zinc-900 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
              <SearchForm
                query={query}
                onChange={setQuery}
                onSubmit={() => search(query)}
                busy={busy}
                blocked={overCap}
                mock={mock}
                simulate={simulate}
                onSimulate={setSimulate}
              />
            </div>
            <div className="lg:col-start-1">
              <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {STATS.map(([n, label]) => (
                  <div key={label}>
                    <dt className="text-2xl font-semibold tabular-nums">{n}</dt>
                    <dd className="mt-0.5 text-xs leading-snug text-white/50">{label}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11px] text-white/35">eRaktKosh, Bangalore Urban, 31 Oct 2026</p>
            </div>

          </div>
        </div>
      </div>

      {/* ---------- Work area ---------- */}
      <div ref={resultsRef} className="mx-auto max-w-6xl scroll-mt-4 px-4 py-8 sm:px-6 lg:py-10">
        {keyMissing && (
          <Banner>
            Live mode is on but <code className="font-mono">TINYFISH_API_KEY</code> is missing from .env.local. Searches will fail
            until it is set.
          </Banner>
        )}
        {overCap && (
          <Banner>
            Spend cap reached ({stepsUsed} of {stepCap} agent steps). {mock ? "Reload to reset the demo." : "Raise BLOODLINK_DAILY_STEP_CAP to continue."}
          </Banner>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <main className="min-w-0 space-y-4">
            <AgentPanel state={state} progress={progress} streamingUrl={streamingUrl} mock={mock} />

            {outcome && submitted && (
              <>
                <p className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-zinc-500">
                  <span>
                    {submitted.group} · {componentName(submitted.component)} · {districtName(submitted.district)}
                  </span>
                  <span className="tabular-nums">
                    {outcome.steps} agent steps · ${outcome.costUsd.toFixed(2)}
                  </span>
                  {outcome.source && <span className="uppercase">{outcome.source === "cache" ? "cached" : outcome.source}</span>}
                </p>
                <Results
                  outcome={outcome}
                  group={submitted.group}
                  district={submitted.district}
                  component={submitted.component}
                  onWiden={doWiden}
                  widening={widening}
                  onRetry={() => !overCap && search(submitted)}
                />
                {widenError && <Banner>Widened search failed: {widenError}</Banner>}
                {(widen || widenPending) && (
                  <WidenPanel results={widen} pending={widenPending} group={submitted.group} baseComponent={submitted.component} />
                )}
                {outcome.kind !== "failed" && (
                  <ActionsPanel
                    group={submitted.group}
                    component={submitted.component}
                    banks={[...outcome.banks, ...(widen ?? []).flatMap((r) => r.banks)].sort((a, b) => b.score - a.score)}
                    watching={watching}
                    onToggleWatch={() => {
                      setWatching((w) => !w);
                      setWatchNote(null);
                    }}
                    watchNote={watchNote}
                    mock={mock}
                  />
                )}
              </>
            )}
          </main>

          <SidePanel group={submitted?.group ?? query.group} mock={mock} />
        </div>
      </div>

      <div className="border-t border-zinc-200/70">
        <Features />
      </div>

      <footer className="border-t border-zinc-200/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs leading-relaxed text-zinc-500 sm:px-6 md:flex-row md:justify-between">
          <p className="max-w-2xl">
            <b className="text-zinc-700">Not medical advice.</b> Stock comes from eRaktKosh (Ministry of Health &amp; Family
            Welfare) and can be out of date. Always call the blood bank before travelling. Only the treating doctor decides on
            component or group substitutions.
            {mock && " Demo mode shows sample data shaped from a real snapshot, not live stock."}
          </p>
          <p className="shrink-0">Built with TinyFish · Bengaluru 2026</p>
        </div>
      </footer>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900" role="alert">
      <Alert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
