import { BookOpen, Bot, Globe, Layers, Radar, Shield, Table } from "./icons";

const FEATURES = [
  { icon: Bot, api: "Web Agent · run-sse", title: "Live stock search", body: "Operates eRaktKosh like a person: fills the form, shows every row, streams the browser live." },
  { icon: Layers, api: "Web Agent · run-async", title: "Parallel widen", body: "Nothing nearby? Up to 7 agents check neighbouring districts and other components at once." },
  { icon: Globe, api: "Search + Fetch", title: "Contact lookup", body: "Finds a bank's own page and pulls extra phone numbers when eRaktKosh lists none." },
  { icon: Radar, api: "Monitor", title: "Camp watch", body: "A daily 8 AM IST monitor collects new blood donation camps in Bengaluru." },
  { icon: Table, api: "Datasets", title: "Bank directory", body: "A structured list of Bengaluru blood banks with phone numbers, for when search is down." },
  { icon: BookOpen, api: "Research", title: "Rare-group guide", body: "A cited, deep-research guide for Bombay (Oh) blood group families." },
] as const;

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-blood-600 uppercase">Built on TinyFish</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">Six TinyFish APIs, one job each</h2>
        <p className="mt-2 text-zinc-600">
          Government stock data exists, but it hides behind dropdowns and pages. BloodLink sends agents to read it for you.
        </p>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, api, title, body }) => (
          <div key={title} className="card p-5 transition hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blood-50 text-blood-600">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[10.5px] font-semibold tracking-wide text-zinc-400 uppercase">{api}</span>
            </div>
            <h3 className="mt-4 font-semibold text-zinc-900">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-3 rounded-[1.25rem] border border-zinc-200 bg-white/60 p-5 text-sm text-zinc-600">
        <Shield className="mt-0.5 h-[18px] w-[18px] shrink-0 text-zinc-400" />
        <p>
          <b className="text-zinc-800">Guard rails.</b> Inputs are whitelisted before they reach an agent goal. A server-side
          ledger caps agent spend per day. Every result is validated, and if a live run fails you see the last good result,
          clearly labelled.
        </p>
      </div>
    </section>
  );
}
