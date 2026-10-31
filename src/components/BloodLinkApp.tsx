"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { componentName, districtName } from "@/lib/eraktkosh";
import { expandTargets } from "@/lib/expand";
import { estimateCost } from "@/lib/parse";
import type { ExpandResult, ExpandTarget, SearchQuery } from "@/lib/types";
import { useAgentSearch } from "@/lib/useAgentSearch";
import { parseQuery } from "@/lib/validate";
import { ActionsPanel } from "./ActionsPanel";
import { AgentPanel } from "./AgentPanel";
import { Features } from "./Features";
import { Alert, DropSolid, Fish } from "./icons";
import { Results } from "./Results";
import { SearchForm } from "./SearchForm";
import { SidePanel } from "./SidePanel";
import { ThemeToggle } from "./ThemeToggle";
import { Sponsors } from "./Sponsors";
import { WidenPanel } from "./WidenPanel";

const WATCH_MS_MOCK = 30_000;
const WATCH_MS_LIVE = 30 * 60_000;
const MAX_WATCH_CHECKS = 6;
/** Rough step budgets used to refuse work *before* it would cross the cap. */
const EST_SEARCH_STEPS = 25;
const EST_WIDEN_STEPS = 7 * 20;

/** Observed on eRaktKosh, Bangalore Urban, 31 Oct 2026. */
const STATS = [
  ["95", "blood banks in Bengaluru"],
  ["3", "have O− right now"],
  ["~2 s", "to check them all"],
  ["8 mo", "oldest update we flag"],
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

  // Links from the Telegram bot open /?group=O-&component=11&district=572: pre-fill, never auto-run (costs credits).
  useEffect(() => {
    const p = Object.fromEntries(new URLSearchParams(window.location.search));
    if (!p.group) return;
    const parsed = parseQuery({ state: "29", component: "11", district: "572", ...p });
    if (parsed.ok) setQuery(parsed.query);
  }, []);

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
  const hasResults = !!(outcome && submitted);

  return (
    <div id="top" className="min-h-screen">
      {/* ---------- Hero ---------- */}
      <div className="hero-bg relative overflow-hidden text-zinc-900">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="flex items-center justify-between gap-3 py-5">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-blood-600 shadow-[0_8px_20px_-6px_rgb(179_38_30/0.6)]">
                <DropSolid className="h-4 w-4 text-white" />
              </span>
              <span className="serif text-[22px] tracking-tight">Blood<i className="text-blood-600">Link</i></span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <a href="#how" className="hidden rounded-full px-3 py-1.5 font-medium text-zinc-500 transition hover:bg-ink/5 hover:text-zinc-900 sm:inline">
                How it works
              </a>
              <a href="#sponsors" className="hidden rounded-full px-3 py-1.5 font-medium text-zinc-500 transition hover:bg-ink/5 hover:text-zinc-900 sm:inline">
                Partners
              </a>
              {mock && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 ring-1 ring-amber-300 ring-inset">
                  Demo data
                </span>
              )}
              <span
                className="hidden items-center gap-2 rounded-full bg-paper px-3 py-1 font-medium text-zinc-600 ring-1 ring-zinc-200 ring-inset sm:inline-flex"
                title="TinyFish Web Agent costs $0.016 per step"
              >
                <span className="h-1 w-12 overflow-hidden rounded-full bg-zinc-200">
                  <span className={`block h-full rounded-full ${overCap ? "bg-blood-500" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="tabular-nums">
                  ${estimateCost(stepsUsed).toFixed(2)} / ${estimateCost(stepCap).toFixed(2)}
                </span>
              </span>
              <ThemeToggle />
              <span className="hidden items-center gap-1.5 text-zinc-500 md:inline-flex">
                <Fish className="h-3.5 w-3.5" /> TinyFish
              </span>
            </div>
          </nav>

          <div className="grid gap-x-14 gap-y-10 pt-8 pb-16 lg:grid-cols-[1fr_440px] lg:pt-14 lg:pb-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-blood-50 px-3 py-1 text-xs font-bold tracking-[0.12em] text-blood-700 uppercase ring-1 ring-blood-100 ring-inset">
                <span className="h-1.5 w-1.5 rounded-full bg-blood-500" /> Live from eRaktKosh · all 31 districts
              </p>
              <h1 className="mt-6 text-[2.6rem] leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.2rem]">
                Someone needs blood.{" "}
                <i className="font-normal text-blood-600">Let&apos;s find it.</i>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-zinc-500 sm:text-lg">
                We read the government&apos;s live blood stock for you in about two seconds and hand back a short list
                of banks to call, closest and freshest first.
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
              <dl className="grid max-w-xl grid-cols-2 gap-x-8 gap-y-5 border-y border-zinc-200 py-6 sm:grid-cols-4">
                {STATS.map(([n, label]) => (
                  <div key={label}>
                    <dt className="serif text-3xl tabular-nums">{n}</dt>
                    <dd className="mt-1 text-xs leading-snug text-zinc-500">{label}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11px] text-zinc-400">eRaktKosh, Bangalore Urban, 31 Oct 2026</p>
            </div>

          </div>
        </div>
      </div>

      {/* ---------- Work area ---------- */}
      <div ref={resultsRef} className="section mx-auto max-w-6xl scroll-mt-4 px-4 sm:px-6">
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

        <div className={hasResults ? "grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_340px]" : "grid grid-cols-1 gap-8"}>
          <main className="min-w-0 space-y-6">
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
                    district={submitted.district}
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

          <SidePanel
            group={submitted?.group ?? query.group}
            district={districtName(submitted?.district ?? query.district)}
            mock={mock}
            row={!hasResults}
          />
        </div>
      </div>

      <div className="border-t border-zinc-200/70">
        <Features />
      </div>

      <Sponsors />

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
