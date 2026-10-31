"use client";

import { useState } from "react";
import { componentName, districtName } from "@/lib/eraktkosh";
import { mapsUrl } from "@/lib/share";
import type { Bank, BloodGroup } from "@/lib/types";
import { External, MapPin, Phone, Search } from "./icons";

const FRESH = {
  fresh: { label: "Fresh", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", dot: "bg-emerald-500" },
  recent: { label: "Today", cls: "bg-amber-50 text-amber-700 ring-amber-600/15", dot: "bg-amber-500" },
  stale: { label: "Stale", cls: "bg-blood-50 text-blood-700 ring-blood-600/15", dot: "bg-blood-500" },
  unknown: { label: "Unknown", cls: "bg-zinc-100 text-zinc-600 ring-zinc-500/10", dot: "bg-zinc-400" },
} as const;

function age(h: number | null) {
  if (h === null) return "update time unknown";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  if (h < 24 * 60) return `${Math.round(h / 24)} days ago`;
  return `${Math.round(h / 24 / 30)} months ago`;
}

interface Enriched {
  phones: string[];
  sources: { title: string; url: string }[];
}

export function BankCard({ bank, group, rank, baseComponent }: { bank: Bank; group: BloodGroup; rank?: number; baseComponent?: string }) {
  const f = FRESH[bank.freshness];
  const otherGroups = Object.entries(bank.units).filter(([g]) => g !== group);
  const otherComponent = baseComponent && bank.component !== baseComponent;
  const [extra, setExtra] = useState<Enriched | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState(false);

  async function lookup() {
    setLooking(true);
    setLookErr(false);
    try {
      const r = await fetch(`/api/enrich?name=${encodeURIComponent(bank.name)}`);
      if (!r.ok) throw new Error();
      setExtra(await r.json());
    } catch {
      setLookErr(true);
    } finally {
      setLooking(false);
    }
  }

  const phones = [...new Set([...bank.phones, ...(extra?.phones ?? [])])];

  return (
    <article
      className={`card animate-rise overflow-hidden ${bank.hasRequested ? "" : "opacity-90"}`}
      style={rank ? { animationDelay: `${Math.min(rank, 8) * 50}ms` } : undefined}
    >
      <div className="flex gap-4 p-4 sm:p-5">
        <div
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-center ${
            bank.hasRequested ? "bg-blood-50 text-blood-700" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {bank.hasRequested ? (
            <div>
              <div className="text-2xl leading-none font-bold tabular-nums">{bank.requestedUnits ?? "✓"}</div>
              <div className="mt-1 text-xs font-semibold tracking-wide uppercase">{bank.requestedUnits === null ? "in stock" : "units"}</div>
            </div>
          ) : (
            <div className="text-xs leading-tight font-semibold">
              No
              <br />
              {group}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="leading-snug font-semibold text-zinc-900">
              {rank !== undefined && <span className="mr-1.5 text-zinc-300 tabular-nums">{rank}</span>}
              {bank.name}
            </h3>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-zinc-500" title={bank.address}>
            {bank.address || districtName(bank.district)}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12.5px] font-medium">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ring-1 ring-inset ${f.cls}`} title={bank.lastUpdated ? `${bank.lastUpdated} IST` : ""}>
              <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />
              {f.label} · {age(bank.ageHours)}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">{bank.category}</span>
            <span className={`rounded-full px-2 py-0.5 ${otherComponent ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600"}`}>
              {otherComponent && "⚠ "}
              {componentName(bank.component)}
            </span>
            {baseComponent && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">{districtName(bank.district)}</span>}
          </div>
          {otherGroups.length > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              Also in stock:{" "}
              <span className="font-medium text-zinc-700 tabular-nums">
                {otherGroups.map(([g, n]) => (n === null ? g : `${g} ${n}`)).join(" · ")}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 sm:px-5">
        {phones.length > 0 ? (
          phones.slice(0, 3).map((p) => (
            <a
              key={p}
              href={`tel:${p}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blood-600 px-3 py-1.5 text-sm font-semibold text-white tabular-nums shadow-sm transition hover:bg-blood-500"
            >
              <Phone className="h-3.5 w-3.5" /> {p}
            </a>
          ))
        ) : (
          <span className="text-xs text-zinc-500">No phone on eRaktKosh</span>
        )}
        <a
          href={mapsUrl(bank)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-paper px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          <MapPin className="h-3.5 w-3.5" /> Directions
        </a>
        {bank.hasRequested && !extra && (
          <button
            onClick={lookup}
            disabled={looking}
            title="TinyFish Search + Fetch (free) look for the bank's own contact page"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-60"
          >
            <Search className="h-3.5 w-3.5" /> {looking ? "Looking…" : lookErr ? "Retry contact lookup" : "Find more contacts"}
          </button>
        )}
      </div>

      {extra && (
        <div className="border-t border-zinc-100 px-4 py-3 text-xs sm:px-5">
          <p className="mb-1.5 font-medium text-zinc-500">
            Found on the web via TinyFish Search + Fetch{extra.phones.length === 0 && " (no extra numbers)"}
          </p>
          <ul className="space-y-1">
            {extra.sources.slice(0, 3).map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-700 hover:text-blood-700 hover:underline">
                  {s.title} <External className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
