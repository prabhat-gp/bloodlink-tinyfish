"use client";

import { COMPONENTS, DISTRICTS } from "@/lib/eraktkosh";
import { BLOOD_GROUPS, type BloodGroup, type SearchQuery } from "@/lib/types";
import { ChevronDown, Search } from "./icons";

export const SIMULATIONS = [
  ["none", "Normal"],
  ["empty", "Nothing in stock"],
  ["fail", "Site error"],
  ["slow", "Slow site"],
] as const;

interface Props {
  query: SearchQuery;
  onChange: (q: SearchQuery) => void;
  onSubmit: () => void;
  busy: boolean;
  /** Spend cap reached: different message from "busy". */
  blocked: boolean;
  mock: boolean;
  simulate: string;
  onSimulate: (s: string) => void;
}

function Select({
  label,
  value,
  onChange,
  options,
  sort,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  /** Codes are numeric, so object order is code order; sort by name for long lists. */
  sort?: boolean;
}) {
  const entries = Object.entries(options);
  if (sort) entries.sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</span>
      <span className="relative block">
        <select
          className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 py-3 pr-10 pl-3.5 text-[15px] font-medium text-zinc-900 transition outline-none hover:border-zinc-300 focus:border-blood-500 focus:bg-paper focus:ring-4 focus:ring-blood-500/15"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {entries.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-zinc-400" />
      </span>
    </label>
  );
}

export function SearchForm({ query, onChange, onSubmit, busy, blocked, mock, simulate, onSimulate }: Props) {
  return (
    <form
      className="card relative p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !blocked) onSubmit();
      }}
    >
      <fieldset>
        <legend className="mb-2 block text-xs font-medium tracking-wide text-zinc-500 uppercase">Blood group needed</legend>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {BLOOD_GROUPS.map((g) => {
            const on = query.group === g;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...query, group: g as BloodGroup })}
                className={`h-11 rounded-xl text-[15px] font-semibold tabular-nums transition ${
                  on
                    ? "bg-blood-600 text-white shadow-[0_6px_16px_-6px_rgb(224_16_60/0.7)]"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
        <p className={`mt-2 text-xs text-blood-700 ${query.group.startsWith("Oh") ? "" : "invisible"}`}>
          Oh is the Bombay blood group. Only Oh blood is compatible.
        </p>
      </fieldset>

      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Component" value={query.component} onChange={(component) => onChange({ ...query, component })} options={COMPONENTS} />
        <Select label="District · Karnataka" value={query.district} onChange={(district) => onChange({ ...query, district })} options={DISTRICTS} sort />
      </div>

      <button
        type="submit"
        disabled={busy || blocked}
        className="group mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-blood-600 text-base font-semibold text-white transition hover:bg-blood-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Agent is searching eRaktKosh…
          </>
        ) : blocked ? (
          "Spend cap reached"
        ) : (
          <>
            <Search className="h-[18px] w-[18px]" /> Find blood now
          </>
        )}
      </button>

      {mock && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-dashed border-zinc-200 pt-4 text-xs text-zinc-500">
          <span className="mr-1 font-medium text-zinc-600">Demo · simulate</span>
          {SIMULATIONS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={simulate === v}
              onClick={() => onSimulate(v)}
              className={`rounded-full px-2.5 py-1 font-medium transition ${
                simulate === v ? "bg-ink text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
