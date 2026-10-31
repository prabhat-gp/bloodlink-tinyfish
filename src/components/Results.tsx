"use client";

import { useState } from "react";
import { componentName, districtName } from "@/lib/eraktkosh";
import type { BloodGroup, SearchOutcome } from "@/lib/types";
import { BankCard } from "./BankCard";
import { Alert, ChevronDown, Layers } from "./icons";

interface Props {
  outcome: SearchOutcome;
  group: BloodGroup;
  district: string;
  component: string;
  onWiden: () => void;
  widening: boolean;
  onRetry: () => void;
}

function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

export function Results({ outcome, group, district, component, onWiden, widening, onRetry }: Props) {
  const [showAll, setShowAll] = useState(false);
  const withGroup = outcome.banks.filter((b) => b.hasRequested);
  const rest = outcome.banks.filter((b) => !b.hasRequested);

  if (outcome.kind === "failed") {
    return (
      <section className="card animate-rise border-amber-200 p-5 sm:p-6" role="alert">
        <div className="flex gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <Alert className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-zinc-900">We couldn&apos;t read eRaktKosh this time</h2>
            <p className="mt-1 text-sm text-zinc-600">{outcome.reason}</p>
            <p className="mt-1 text-sm text-zinc-600">
              Retry, or call a blood bank straight from the{" "}
              <a href="#directory" className="font-medium text-blood-700 underline underline-offset-2">
                directory
              </a>
              .
            </p>
            <button onClick={onRetry} className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800">
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {outcome.source === "cache" && outcome.cachedAt && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <b>Live search failed</b> ({outcome.reason ?? "site error"}). Showing the last good result from{" "}
            <b>{timeAgo(outcome.cachedAt)}</b>. Call to confirm.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2 pt-1">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          {withGroup.length > 0 ? (
            <>
              <span className="text-blood-600 tabular-nums">{withGroup.length}</span> of {outcome.banks.length} blood banks have {group}
            </>
          ) : (
            <>No blood bank lists {group} right now</>
          )}
        </h2>
        <span className="text-[13px] text-zinc-500">
          {componentName(component)} · {districtName(district)}
        </span>
      </div>

      {withGroup.length === 0 && (
        <div className="card overflow-hidden">
          <div className="p-5 sm:p-6">
            <p className="text-sm text-zinc-600">
              {outcome.banks.length === 0
                ? "eRaktKosh returned no blood banks for this search."
                : `The agent checked all ${outcome.banks.length} blood banks. None list ${group} ${componentName(component)}.`}
            </p>
            <button
              onClick={onWiden}
              disabled={widening}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blood-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgb(224_16_60/0.7)] transition hover:bg-blood-700 disabled:opacity-60"
            >
              <Layers className="h-4 w-4" />
              {widening ? "7 agents searching in parallel…" : "Widen: nearby districts + other components"}
            </button>
            <p className="mt-2 text-xs text-zinc-400">Runs up to 7 TinyFish agents in parallel.</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {withGroup.map((b, i) => (
          <BankCard key={b.id} bank={b} group={group} rank={i + 1} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {rest.length > 0 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            aria-expanded={showAll}
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition hover:text-zinc-800"
          >
            <ChevronDown className={`h-4 w-4 transition ${showAll ? "rotate-180" : ""}`} />
            {showAll ? "Hide" : "Show"} {rest.length} banks without {group}
          </button>
        )}
        {withGroup.length > 0 && (
          <button
            onClick={onWiden}
            disabled={widening}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blood-700 transition hover:text-blood-800 disabled:opacity-60"
          >
            <Layers className="h-4 w-4" />
            {widening ? "Searching nearby…" : "Also search nearby districts"}
          </button>
        )}
      </div>
      {showAll && (
        <div className="space-y-3">
          {rest.map((b) => (
            <BankCard key={b.id} bank={b} group={group} />
          ))}
        </div>
      )}
    </section>
  );
}
