"use client";

import { useEffect, useState } from "react";
import type { Camp, Source } from "@/lib/mock/fixtures";
import type { BloodGroup } from "@/lib/types";
import { BookOpen, External, Phone, Radar, Table } from "./icons";

interface MonitorInfo {
  id: string;
  schedule: string;
  lastRunAt?: string;
  camps: Camp[];
}
interface Research {
  summary: string;
  steps: string[];
  citations: Source[];
  source: string;
}
interface Entry {
  name: string;
  phone: string | null;
  area: string | null;
  district: string | null;
}

/** Small "which TinyFish API powers this" tag. */
export function ApiTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-zinc-500 uppercase">
      {children}
    </span>
  );
}

function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [url]);
  return { data, error, setData };
}

function BombayCard() {
  const { data, error } = useJson<Research>("/api/research");
  return (
    <section className="card animate-rise overflow-hidden border-blood-200">
      <div className="bg-gradient-to-br from-blood-600 to-blood-800 p-5 text-white">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Bombay blood group (Oh)</h2>
          <BookOpen className="h-4 w-4 text-white/70" />
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/85">
          About 1 in 10,000 Indians. Oh patients can only receive Oh blood, so regular O stock does not help.
        </p>
      </div>
      <div className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-700">What to do now</span>
          <ApiTag>Research{data?.source === "mock" && " · demo"}</ApiTag>
        </div>
        {error && <p className="text-xs text-zinc-500">Guide unavailable right now.</p>}
        {!data && !error && <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />}
        {data && (
          <>
            <ol className="space-y-2 text-[13px] text-zinc-700">
              {(data.steps.length ? data.steps : [data.summary]).slice(0, 5).map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blood-50 text-[11px] font-bold text-blood-700">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {data.citations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.citations.slice(0, 4).map((c, i) => (
                  <a
                    key={c.url + i}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    title={c.title}
                    className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-200"
                  >
                    [{i + 1}] {new URL(c.url).hostname.replace(/^www\./, "")}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function CampsCard({ mock }: { mock: boolean }) {
  const camps = useJson<{ camps: Camp[]; source: string }>("/api/camps");
  const mon = useJson<{ monitor: MonitorInfo | null }>("/api/monitor");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const monitor = mon.data?.monitor ?? null;

  async function monitorAction(action: "create" | "run") {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Monitor failed");
      mon.setData(d);
      if (d.monitor?.camps?.length) camps.setData({ camps: d.monitor.camps, source: "monitor" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Monitor failed");
    } finally {
      setBusy(false);
    }
  }

  const list = camps.data?.camps;
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-900">Donation camps</h2>
        <ApiTag>
          {camps.data?.source === "monitor" || monitor ? "Monitor" : "Search"}
          {mock && " · demo"}
        </ApiTag>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">Point donors here so stock gets replenished</p>
      {camps.error && <p className="mt-3 text-xs text-amber-700">Couldn&apos;t load camps right now.</p>}
      {!list && !camps.error && <div className="mt-3 h-20 animate-pulse rounded-lg bg-zinc-100" />}
      {list?.length === 0 && <p className="mt-3 text-xs text-zinc-500">No camps found in the last two weeks.</p>}
      <ul className="mt-3 space-y-2">
        {list?.slice(0, 4).map((c) => (
          <li key={c.title + c.date} className="rounded-xl bg-zinc-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13px] leading-snug font-medium text-zinc-800">{c.title}</span>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" aria-label="Open source" className="shrink-0 text-zinc-400 hover:text-zinc-700">
                  <External className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
              {[c.date, c.place, c.organiser].filter(Boolean).join(" · ")}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 p-3">
        <Radar className={`h-4 w-4 shrink-0 ${monitor ? "text-emerald-600" : "text-zinc-400"}`} />
        <div className="min-w-0 flex-1 text-xs">
          {monitor ? (
            <>
              <div className="font-medium text-zinc-800">Daily watch on · 8 AM IST</div>
              <div className="truncate text-zinc-500">
                {monitor.id}
                {monitor.lastRunAt && ` · ran ${new Date(monitor.lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium text-zinc-800">Watch for new camps daily</div>
              <div className="text-zinc-500">TinyFish Monitor · {mock ? "free in demo" : "$0.005 per run"}</div>
            </>
          )}
        </div>
        <button
          onClick={() => monitorAction(monitor ? "run" : "create")}
          disabled={busy}
          className="shrink-0 rounded-lg bg-blood-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blood-500 disabled:opacity-60"
        >
          {busy ? "…" : monitor ? "Run now" : "Turn on"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-amber-700">{err}</p>}
    </section>
  );
}

/** The dataset uses new Kannada spellings ("Mysuru", "Shivamogga"); eRaktKosh uses the old ones. */
const SPELLINGS: [RegExp, string][] = [
  [/bengaluru/g, "bangalore"],
  [/mysuru/g, "mysore"],
  [/shivamogga/g, "shimoga"],
  [/chikkamagaluru/g, "chikmagalur"],
  [/tumakuru/g, "tumkur"],
  [/bagalkote/g, "bagalkot"],
  [/kalburgi|gulbarga/g, "kalaburagi"],
  [/bellary/g, "ballari"],
  [/belgaum/g, "belagavi"],
  [/bijapur/g, "vijayapura"],
  [/chikballapur(a)?/g, "chikkaballapura"],
];
const normDistrict = (s: string) =>
  SPELLINGS.reduce((acc, [re, to]) => acc.replace(re, to), s.toLowerCase())
    .replace(/district/g, "")
    .replace(/[^a-z]/g, "");
const sameDistrict = (a: string, b: string) => normDistrict(a) === normDistrict(b);

function DirectoryCard({ district }: { district: string }) {
  const { data, error } = useJson<{ entries: Entry[]; source: string }>("/api/directory");
  const [all, setAll] = useState(false);
  const withPhone = (data?.entries ?? []).filter((e) => e.phone);
  const local = withPhone.filter((e) => e.district && sameDistrict(e.district, district));
  // Fall back to the whole state when the dataset has nobody for this district.
  const entries = local.length ? local : withPhone;
  const scope = local.length ? district : "Karnataka";
  return (
    <section id="directory" className="card scroll-mt-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-900">Blood bank directory</h2>
        <ApiTag>
          <Table className="h-3 w-3" /> {data?.source === "dataset" ? "Datasets" : "Snapshot"}
        </ApiTag>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        {scope} · {entries.length} banks · call directly if search is down
      </p>
      {error && <p className="mt-3 text-xs text-amber-700">Directory unavailable.</p>}
      {!data && !error && <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-100" />}
      <ul className={`scrollbar-thin mt-3 divide-y divide-zinc-100 ${all ? "max-h-96 overflow-y-auto" : ""}`}>
        {entries.slice(0, all ? 300 : 6).map((d, i) => (
          <li key={`${d.name}-${i}`} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-[13px] text-zinc-800" title={d.name}>
                {d.name}
              </span>
              {(d.area || d.district) && (
                <span className="block truncate text-[11px] text-zinc-400">{[d.area, scope === "Karnataka" ? d.district : null].filter(Boolean).join(" · ")}</span>
              )}
            </span>
            <a
              href={`tel:${d.phone}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-blood-700 tabular-nums hover:bg-blood-50"
            >
              <Phone className="h-3 w-3" />
              {d.phone}
            </a>
          </li>
        ))}
      </ul>
      {entries.length > 6 && (
        <button onClick={() => setAll((a) => !a)} className="mt-1 text-xs font-medium text-zinc-500 hover:text-zinc-800">
          {all ? "Show fewer" : `Show all ${entries.length}`}
        </button>
      )}
    </section>
  );
}

export function SidePanel({ group, district, mock, row = false }: { group: BloodGroup; district: string; mock: boolean; row?: boolean }) {
  return (
    <aside className={row ? "grid items-start gap-6 md:grid-cols-2" : "space-y-5 lg:sticky lg:top-6"}>
      {group.startsWith("Oh") && <BombayCard />}
      <CampsCard mock={mock} />
      <DirectoryCard district={district} />
    </aside>
  );
}
