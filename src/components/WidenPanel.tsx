import { componentName, districtName } from "@/lib/eraktkosh";
import type { BloodGroup, ExpandResult, ExpandTarget } from "@/lib/types";
import { BankCard } from "./BankCard";
import { Alert, Check } from "./icons";

const STATUS = {
  found: "bg-emerald-50 ring-emerald-600/20",
  empty: "bg-paper ring-zinc-900/[0.07]",
  failed: "bg-amber-50 ring-amber-600/20",
  running: "bg-paper ring-zinc-900/[0.07]",
} as const;

/** Grid of parallel agents; `pending` shows the targets while they run. */
export function WidenPanel({
  results,
  pending,
  group,
  baseComponent,
}: {
  results: ExpandResult[] | null;
  pending: ExpandTarget[] | null;
  group: BloodGroup;
  baseComponent: string;
}) {
  const tiles: (ExpandResult | (ExpandTarget & { status: "running" }))[] =
    results ?? (pending ?? []).map((t) => ({ ...t, status: "running" as const }));
  const hits = (results ?? []).flatMap((r) => r.banks.filter((b) => b.hasRequested)).sort((a, b) => b.score - a.score);

  return (
    <section className="space-y-3 pt-2">
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Widened search</h2>
        <span className="text-[13px] text-zinc-500">{tiles.length} TinyFish agents in parallel</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((r) => (
          <div key={`${r.district}-${r.component}`} className={`rounded-2xl p-3 text-xs ring-1 ring-inset ${STATUS[r.status]}`}>
            <div className="truncate font-semibold text-zinc-900">{districtName(r.district)}</div>
            <div className="truncate text-zinc-500">{componentName(r.component)}</div>
            <div className="mt-2 flex items-center gap-1.5 font-medium">
              {r.status === "running" && (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-200 border-t-blood-500" />
                  <span className="text-zinc-500">Searching…</span>
                </>
              )}
              {r.status === "found" && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> {r.banks.filter((b) => b.hasRequested).length} with {group}
                </span>
              )}
              {r.status === "empty" && <span className="text-zinc-500">None</span>}
              {r.status === "failed" && (
                <span className="inline-flex min-w-0 items-center gap-1 text-amber-800" title={r.reason}>
                  <Alert className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{r.reason ?? "Failed"}</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {results && hits.some((b) => b.component !== baseComponent) && (
        <p className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[13px] text-amber-900">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Some matches are a <b>different blood component</b>. Only the treating doctor can decide whether it is acceptable.
          </span>
        </p>
      )}
      {results &&
        (hits.length === 0 ? (
          <p className="card p-5 text-sm text-zinc-600">No nearby stock either. Turn on “Keep looking” below and share the request with donors.</p>
        ) : (
          <div className="space-y-3">
            {hits.map((b, i) => (
              <BankCard key={b.id} bank={b} group={group} rank={i + 1} baseComponent={baseComponent} />
            ))}
          </div>
        ))}
    </section>
  );
}
