"use client";

import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode, type SVGProps } from "react";
import { TELEGRAM_BOT } from "@/lib/share";
import { ArrowRight, BookOpen, Bot, Check, FileText, Globe, Layers, Phone, Radar, Shield, Table } from "./icons";
import { Reveal, trackSpotlight } from "./motion";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** 0→1 as p moves from a to b. Every visual below is a pure function of scroll progress. */
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const on = (p: number, at: number) => p >= at;

interface Chapter {
  icon: Icon;
  api: string;
  endpoint: string;
  title: string;
  body: string;
  why: string;
  stat: [string, string];
  Visual: ComponentType<{ p: number }>;
}

/** Numbers come from the first live runs on 31 Oct 2026. */
const CHAPTERS: Chapter[] = [
  {
    icon: Bot,
    api: "Web Agent · run-sse",
    endpoint: "POST /v1/automation/run-sse",
    title: "An agent reads the government site, live",
    body: "eRaktKosh has no API. A TinyFish agent opens it in a stealth browser on an Indian IP, picks state, district, group and component, then filters the table down to the banks that actually have your blood.",
    why: "Every step streams back as an event, and the browser itself streams into the page, so families watch it work.",
    stat: ["~10", "agent steps per search"],
    Visual: AgentVisual,
  },
  {
    icon: FileText,
    api: "output_schema",
    endpoint: "output_schema · status · banks[]",
    title: "Clean JSON, not screen-scraped text",
    body: "We hand the agent a JSON schema. It returns typed rows: bank, phone, category, the exact availability text and when it was last updated. Nothing to parse by hand.",
    why: "COMPLETED doesn't mean it worked. We validate status and every row before anyone sees it.",
    stat: ["0", "regexes on raw HTML"],
    Visual: SchemaVisual,
  },
  {
    icon: Layers,
    api: "Web Agent · run-async",
    endpoint: "POST /v1/automation/run-async  × 7",
    title: "Nothing nearby? Seven agents fan out",
    body: "One tap widens the search: agents check every neighbouring district and the safe alternative components at the same time, and results land in one view as each finishes.",
    why: "Seven searches in a row take a quarter of an hour. In parallel, as long as the slowest one.",
    stat: ["7", "agents at once"],
    Visual: ParallelVisual,
  },
  {
    icon: Globe,
    api: "Search + Fetch",
    endpoint: "GET api.search.tinyfish.ai → POST api.fetch.tinyfish.ai",
    title: "Finds a phone number that answers",
    body: "Listings often carry a dead or missing number. Search finds the bank's own page, Fetch reads it as clean markdown, and we keep only valid Indian phone numbers.",
    why: "A lookup doesn't need a browser. Both APIs are instant and free.",
    stat: ["$0", "per lookup"],
    Visual: SearchFetchVisual,
  },
  {
    icon: Radar,
    api: "Monitor",
    endpoint: "POST /v1/monitors · CRON_TZ=Asia/Kolkata 0 8 * * *",
    title: "Watches for donation camps every morning",
    body: "At 8 AM IST a monitor sweeps the web for new blood donation camps around Bengaluru, so donors know where to give today and stock gets refilled.",
    why: "It runs on TinyFish's schedule, so the list stays fresh with nobody online.",
    stat: ["$0.005", "per daily run"],
    Visual: MonitorVisual,
  },
  {
    icon: Table,
    api: "Datasets",
    endpoint: "POST /v1/datasets · target_rows 250",
    title: "A statewide directory from one prompt",
    body: "One prompt built a structured directory of blood banks with phone numbers across all 31 Karnataka districts. When the live site is down, families can still call.",
    why: "One prompt in, a typed table out. No spreadsheet to keep up to date.",
    stat: ["250", "banks · 31 districts"],
    Visual: DatasetVisual,
  },
  {
    icon: BookOpen,
    api: "Research · deep",
    endpoint: "POST /v1/automation/run-research-async",
    title: "A cited plan for the rarest blood",
    body: "Bombay (Oh) patients can't take ordinary O blood. Deep research read 35 sources and wrote a plan: the helpline, the rare-donor registries, and which relatives to test first.",
    why: "A rare case needs sourced answers, not a guess. Every step links to where it came from.",
    stat: ["35", "sources read"],
    Visual: ResearchVisual,
  },
  {
    icon: Phone,
    api: "Same agent · Telegram",
    endpoint: `t.me/${TELEGRAM_BOT}`,
    title: "Or just text the bot",
    body: "In a hospital corridor nobody opens a website. Text “need O- blood near HSR” and the same TinyFish agent runs, with a live-view link, results in chat, and an alert when new stock appears.",
    why: "One agent layer, two front doors. The bot shares the web app's agent, cache and spend cap.",
    stat: ["1", "message to search"],
    Visual: TelegramVisual,
  },
];

const STACK = [
  "Web Agent · run-sse",
  "Web Agent · run-async",
  "Live browser stream",
  "Stealth browser",
  "India proxy",
  "output_schema",
  "Run cancel",
  "Search",
  "Fetch",
  "Monitor",
  "Datasets",
  "Research",
];

/** Which chapter is under the reading line, and how far through it we are. */
function useChapterProgress(n: number) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [state, setState] = useState({ active: 0, p: 0 });
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.55;
      let active = 0;
      let p = 0;
      refs.current.slice(0, n).forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= line) {
          active = i;
          // Finish each animation 70% of the way through its chapter, then hold the end state.
          p = Math.min(1, Math.max(0, (line - r.top) / (r.height * 0.7)));
        }
      });
      setState((s) => (s.active === active && Math.abs(s.p - p) < 0.003 ? s : { active, p }));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [n]);
  return [refs, state] as const;
}

export function Features() {
  const [refs, { active, p }] = useChapterProgress(CHAPTERS.length);
  const c = CHAPTERS[active];

  return (
    <section id="how" className="section relative">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.18em] text-blood-600 uppercase">How TinyFish powers BloodLink</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            One emergency. <span className="bg-gradient-to-r from-blood-600 to-blood-400 bg-clip-text text-transparent">Every TinyFish tool</span>, one job each.
          </h2>
          <p className="mt-4 max-w-2xl text-zinc-600">Scroll to watch each one do its part, exactly as it runs in the app.</p>
        </Reveal>
      </div>

      {/* Everything we used, drifting by. Hover to pause. */}
      <div className="group relative mt-10 overflow-hidden py-1 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-marquee gap-2 group-hover:[animation-play-state:paused]">
          {[...STACK, ...STACK].map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blood-300 hover:text-blood-700"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blood-500" />
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-12 grid max-w-6xl gap-x-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Stage: sticky, redraws from scroll progress */}
        <div className="sticky top-3 z-10 h-[46vh] lg:order-2 lg:top-[12vh] lg:h-[76vh]">
          <div
            onMouseMove={trackSpotlight}
            className="spotlight flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-ink text-white shadow-[0_30px_70px_-30px_rgb(12_12_16/0.7)] ring-1 ring-white/5"
            style={{ "--spot": "rgb(244 42 80 / 0.12)" } as CSSProperties}
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blood-600 shadow-lg shadow-blood-600/40">
                <c.icon className="h-3.5 w-3.5" />
              </span>
              <span key={active} className="min-w-0 flex-1 animate-rise truncate font-mono text-[11px] text-white/55">
                {c.endpoint}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-white/40 tabular-nums">
                {String(active + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")}
              </span>
            </div>
            <div className="relative flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_top,#1d1d27,#121218)]">
              <c.Visual p={p} />
            </div>
            <div className="flex gap-1 px-4 py-3">
              {CHAPTERS.map((x, i) => (
                <button
                  key={x.api}
                  aria-label={`Go to ${x.api}`}
                  onClick={() => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="group h-3 flex-1 py-1"
                >
                  <span className="block h-1 overflow-hidden rounded-full bg-white/10 transition group-hover:bg-white/25">
                    <span
                      className="block h-full origin-left rounded-full bg-blood-500"
                      style={{ transform: `scaleX(${i < active ? 1 : i === active ? p : 0})` }}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chapters: the scroll track */}
        <div className="lg:order-1">
          {CHAPTERS.map((x, i) => {
            const isOn = i === active;
            return (
              <article
                key={x.api}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="flex min-h-[44vh] items-center py-8 lg:min-h-[52vh]"
              >
                <div className={`transition duration-500 ${isOn ? "opacity-100" : "opacity-30 blur-[0.5px]"}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-zinc-400 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition duration-500 ${
                        isOn ? "bg-blood-600 text-white shadow-md shadow-blood-600/30" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      <x.icon className="h-3.5 w-3.5" /> {x.api}
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{x.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">{x.body}</p>
                  <p className="mt-4 border-l-2 border-blood-300 pl-3 text-sm leading-relaxed text-zinc-500">{x.why}</p>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight text-zinc-900 tabular-nums">{x.stat[0]}</span>
                    <span className="text-sm text-zinc-500">{x.stat[1]}</span>
                  </div>
                  {i === CHAPTERS.length - 1 && (
                    <a
                      href={`https://t.me/${TELEGRAM_BOT}`}
                      target="_blank"
                      rel="noreferrer"
                      className="group mt-6 inline-flex items-center gap-2 rounded-full bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#229ED9]/30 transition hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Open @{TELEGRAM_BOT} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["Inputs whitelisted", "Only known states, districts, groups and components ever reach an agent goal."],
              ["Spend capped", "A server-side ledger stops runs past a daily step budget, and cancels runs that overrun."],
              ["Honest failures", "Every result is validated. If eRaktKosh is down you see the last good result, clearly labelled."],
            ].map(([t, b]) => (
              <div key={t} className="card flex gap-3 p-4 transition duration-300 hover:-translate-y-1 hover:shadow-lg">
                <Shield className="mt-0.5 h-[18px] w-[18px] shrink-0 text-emerald-600" />
                <p className="text-sm text-zinc-600">
                  <b className="block text-zinc-900">{t}</b>
                  {b}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------- shared bits ----------

/** Fades and lifts in once `show` is true; transitions both ways so scrolling back rewinds it. */
function In({ show, children, className = "", style }: { show: boolean; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`transition-all duration-500 ease-out ${show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

const Pad = ({ children }: { children: ReactNode }) => <div className="absolute inset-0 flex flex-col justify-center gap-3 p-4 sm:p-6">{children}</div>;

// ---------- 1. live agent ----------

const ROWS: [string, string | null][] = [
  ["Suraksha Blood Centre", null],
  ["IGICH Blood Centre", null],
  ["Bangalore Baptist Hospital", "O-Ve:1"],
  ["Jayanagar Voluntary BC", null],
  ["Rotary TTK Blood Centre", null],
  ["Command Hospital", "O-Ve:1"],
  ["Lions Blood Bank", null],
  ["Veerayoga Institute", "O-Ve:6"],
];

function AgentVisual({ p }: { p: number }) {
  const fields = ["Karnataka", "Bangalore Urban", "O-Ve", "Whole Blood"];
  const filter = "O-Ve:".slice(0, Math.round(seg(p, 0.55, 0.68) * 5));
  const filtered = on(p, 0.7);
  const log: [number, string][] = [
    [0.02, "STARTED"],
    [0.06, "STREAMING_URL"],
    [0.2, "select district"],
    [0.45, "click Search"],
    [0.6, "filter “O-Ve:”"],
    [0.88, "COMPLETE · 3 banks"],
  ];
  return (
    <div className="absolute inset-0 grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1.5fr_1fr] sm:p-5">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/10">
        <div className="flex items-center gap-1 border-b border-white/10 px-2.5 py-1.5">
          {["#ff5f57", "#febc2e", "#28c840"].map((col) => (
            <span key={col} className="h-1.5 w-1.5 rounded-full" style={{ background: col }} />
          ))}
          <span className="ml-2 flex-1 truncate font-mono text-[9px] text-white/35">eraktkosh.mohfw.gov.in</span>
          <span className="flex items-center gap-1 rounded bg-blood-600/25 px-1.5 text-[8.5px] font-bold text-blood-200">
            <span className="h-1 w-1 animate-pulse rounded-full bg-blood-400" /> LIVE
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-2.5">
          {fields.map((f, i) => {
            const set = on(p, 0.08 + i * 0.08);
            return (
              <span
                key={f}
                className={`truncate rounded-md border px-2 py-1 text-[10px] transition duration-300 ${
                  set ? "scale-100 border-blood-400/50 bg-blood-500/15 text-blood-100" : "scale-95 border-white/10 bg-white/[0.03] text-white/25"
                }`}
              >
                {set ? f : "Select…"}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-2.5 pb-2">
          <span className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${on(p, 0.42) ? "scale-95 bg-blood-600 text-white" : "bg-white/10 text-white/40"}`}>Search</span>
          <span className={`flex-1 rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[10px] text-white/80 transition ${on(p, 0.52) ? "opacity-100" : "opacity-0"}`}>
            Search: {filter}
            <span className="ml-px inline-block h-2.5 w-px animate-caret border-r border-blood-400 align-middle" />
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-hidden px-2.5 pb-2.5">
          {ROWS.map(([name, stock], i) => {
            const shown = on(p, 0.45 + i * 0.012);
            const hide = filtered && !stock;
            return (
              <div
                key={name}
                className={`flex items-center justify-between overflow-hidden rounded px-2 text-[9.5px] transition-all duration-500 ${
                  hide ? "max-h-0 py-0 opacity-0" : shown ? "max-h-6 py-1 opacity-100" : "max-h-6 py-1 opacity-0"
                } ${stock && on(p, 0.78) ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30" : "bg-white/[0.03] text-white/45"}`}
              >
                <span className="truncate">{name}</span>
                <span className="font-mono">{stock ?? "Not Available"}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hidden min-h-0 flex-col gap-2 sm:flex">
        <div className="flex flex-wrap gap-1">
          {["stealth", "proxy · IN", "streaming"].map((t) => (
            <span key={t} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9.5px] text-white/55 ring-1 ring-white/10">
              {t}
            </span>
          ))}
        </div>
        <ol className="space-y-1.5 font-mono text-[10px]">
          {log.map(([at, e], i) => (
            <li key={e} className={`flex items-center gap-1.5 transition duration-300 ${on(p, at) ? "translate-x-0 text-white/70 opacity-100" : "-translate-x-1 opacity-0"}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i === log.length - 1 ? "bg-emerald-400" : "bg-blood-400"}`} />
              {i > 1 && <span className="text-white/35">PROGRESS</span>}
              <span className="truncate">{e}</span>
            </li>
          ))}
        </ol>
        <p className={`mt-auto text-[10px] text-white/40 transition ${on(p, 0.88) ? "opacity-100" : "opacity-0"}`}>95 banks read → 3 with O− stock</p>
      </div>
    </div>
  );
}

// ---------- 2. structured output ----------

const JSON_LINES = [
  "{",
  '  "status": "success",',
  '  "banks": [',
  "    {",
  '      "bank_name": "Veerayoga Institute",',
  '      "phone": "9845453875",',
  '      "category": "Private",',
  '      "availability_text": "Available, O-Ve:6",',
  '      "last_updated": "2026-03-07 16:02"',
  "    }, …2 more",
  "  ]",
  "}",
];

function SchemaVisual({ p }: { p: number }) {
  const shown = Math.round(seg(p, 0.15, 0.7) * JSON_LINES.length);
  const checks = ["matches output_schema", "status = success (not just COMPLETED)", "3 rows, each with bank + stock"];
  return (
    <div className="absolute inset-0 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
      <div className="hidden flex-col gap-2 sm:flex">
        <p className="text-[10px] font-semibold tracking-wide text-white/40 uppercase">What the page shows</p>
        {["95 Veerayoga Institute Of Medical Sciences… No. 88, Marathhalli… Phone: 9845453875,8042698000 ,Fax: -… Private Available, O-Ve:6 2026-03-07 16:02:27 Blood Bank"].map((t) => (
          <p key={t} className={`rounded-lg bg-white/[0.04] p-2.5 font-mono text-[9.5px] leading-relaxed text-white/45 transition duration-700 ${on(p, 0.1) ? "blur-0" : "blur-[1px]"}`} style={{ opacity: 1 - seg(p, 0.5, 0.9) * 0.6 }}>
            {t}
          </p>
        ))}
        <div className="flex items-center justify-center py-1 text-blood-300" style={{ opacity: seg(p, 0.05, 0.2) }}>
          <ArrowRight className="h-4 w-4 rotate-90" />
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-2">
        <p className="text-[10px] font-semibold tracking-wide text-white/40 uppercase">What we get back</p>
        <pre className="min-h-0 flex-1 overflow-hidden rounded-lg bg-black/40 p-2.5 font-mono text-[10px] leading-[1.55] ring-1 ring-white/10">
          {JSON_LINES.map((l, i) => (
            <div key={i} className={`transition duration-200 ${i < shown ? "opacity-100" : "opacity-0"}`}>
              {l.split(/("[^"]*")/).map((part, j, all) => (
                <span key={j} className={!part.startsWith('"') ? "text-white/50" : all[j + 1]?.startsWith(":") ? "text-blood-300" : "text-emerald-300"}>
                  {part}
                </span>
              ))}
            </div>
          ))}
        </pre>
        <div className="space-y-1">
          {checks.map((c, i) => (
            <p key={c} className={`flex items-center gap-1.5 text-[10.5px] transition duration-300 ${on(p, 0.74 + i * 0.07) ? "text-emerald-300 opacity-100" : "opacity-0"}`}>
              <Check className="h-3 w-3" /> {c}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 3. parallel widen ----------

const LANES: [string, number, number, boolean][] = [
  ["Bangalore Rural", 0.08, 0.45, false],
  ["Ramanagara", 0.1, 0.62, true],
  ["Kolar", 0.06, 0.5, false],
  ["Chikkaballapura", 0.12, 0.78, true],
  ["Tumkur", 0.09, 0.55, false],
  ["Packed RBC", 0.07, 0.4, true],
  ["SAGM Packed RBC", 0.11, 0.7, false],
];

function ParallelVisual({ p }: { p: number }) {
  const done = LANES.filter(([, , b]) => p >= b).length;
  return (
    <Pad>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-white/50">
          <b className="text-lg text-white tabular-nums">{done}</b>/7 agents finished
        </span>
        <span className="font-mono text-white/40 tabular-nums">{Math.round(seg(p, 0.05, 0.8) * 140)}s elapsed · in a row: ~15 min</span>
      </div>
      {LANES.map(([name, a, b, found]) => {
        const w = seg(p, a, b);
        const fin = w >= 1;
        return (
          <div key={name} className="grid grid-cols-[6.5rem_1fr_3.2rem] items-center gap-3 text-[11px] sm:grid-cols-[8rem_1fr_3.5rem]">
            <span className={`truncate transition ${fin && found ? "text-white" : "text-white/55"}`}>{name}</span>
            <span className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
              <span
                className={`absolute inset-y-0 left-0 rounded-full transition-colors ${fin ? (found ? "bg-emerald-400" : "bg-white/30") : "bg-blood-500"}`}
                style={{ width: `${w * 100}%` }}
              />
              {!fin && w > 0 && <span className="absolute inset-y-0 w-8 animate-scan-x bg-gradient-to-r from-transparent via-white/40 to-transparent" style={{ left: `${w * 100 - 8}%` }} />}
            </span>
            <span
              className={`justify-self-end rounded-full px-2 py-0.5 text-[10px] font-semibold transition duration-300 ${
                fin ? (found ? "scale-100 bg-emerald-400/15 text-emerald-300" : "scale-100 bg-white/5 text-white/35") : "scale-50 opacity-0"
              }`}
            >
              {found ? "found" : "none"}
            </span>
          </div>
        );
      })}
    </Pad>
  );
}

// ---------- 4. search + fetch ----------

function SearchFetchVisual({ p }: { p: number }) {
  const q = "Baptist Hospital blood bank phone";
  const typed = q.slice(0, Math.round(seg(p, 0.02, 0.25) * q.length));
  const fetched = on(p, 0.5);
  const lit = on(p, 0.7);
  return (
    <Pad>
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10">
        <Globe className="h-3.5 w-3.5 shrink-0 text-white/40" />
        <span className="truncate font-mono text-[11.5px] text-white/85">{typed}</span>
        <span className="h-3.5 w-px animate-caret border-r border-blood-400" />
        <span className="ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/50">SEARCH</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          {["bbh.org.in › blood-centre", "justdial.com › Bangalore", "practo.com › hospitals"].map((r, i) => (
            <In key={r} show={on(p, 0.27 + i * 0.05)}>
              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-[11px] transition ${i === 0 && on(p, 0.45) ? "bg-blood-500/15 text-white ring-1 ring-blood-400/40" : "bg-white/[0.04] text-white/55"}`}>
                <span className="truncate">{r}</span>
                {i === 0 && on(p, 0.45) && <span className="text-[9px] font-semibold text-blood-200">FETCH →</span>}
              </div>
            </In>
          ))}
        </div>
        <In show={fetched} className="rounded-lg bg-white p-3 text-zinc-700 shadow-xl">
          <p className="text-[10px] font-semibold text-zinc-400"># Blood Centre · markdown</p>
          <p className="mt-1.5 text-[10px] leading-relaxed">
            Our 24×7 blood centre is on the second floor. For requests call{" "}
            <mark className={`rounded px-0.5 font-mono transition ${lit ? "bg-emerald-200 text-emerald-900" : "bg-transparent text-zinc-700"}`}>080 22•• ••••</mark> or{" "}
            <mark className={`rounded px-0.5 font-mono transition delay-150 ${lit ? "bg-emerald-200 text-emerald-900" : "bg-transparent text-zinc-700"}`}>98450 •••••</mark>.
          </p>
          <div className="mt-1.5 space-y-1">
            <div className="h-1.5 w-11/12 rounded bg-zinc-100" />
            <div className="h-1.5 w-3/4 rounded bg-zinc-100" />
          </div>
        </In>
      </div>
      <In show={on(p, 0.82)} className="flex items-center gap-2 text-[11px] text-emerald-300">
        <Phone className="h-3.5 w-3.5" /> 2 more numbers added to the bank card · valid Indian formats only
      </In>
    </Pad>
  );
}

// ---------- 5. monitor ----------

function MonitorVisual({ p }: { p: number }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const camps = [2, 1, 0, 2, 1, 3, 1];
  const cursor = seg(p, 0.05, 0.95);
  const found = days.reduce((n, _, i) => n + (cursor * 7 > i + 0.5 ? camps[i] : 0), 0);
  return (
    <Pad>
      <div className="flex items-center gap-4">
        <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/[0.04] ring-1 ring-white/15">
          <span className="absolute top-1/2 left-1/2 h-6 w-0.5 origin-bottom -translate-x-1/2 -translate-y-full rounded bg-blood-400" style={{ transform: `translate(-50%,-100%) rotate(${cursor * 7 * 360}deg)` }} />
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </div>
        <div>
          <p className="font-mono text-[11px] text-white/60">CRON_TZ=Asia/Kolkata 0 8 * * *</p>
          <p className="text-sm text-white">
            <b className="text-xl tabular-nums">{found}</b> new camps found this week
          </p>
        </div>
      </div>
      <div className="relative mt-2">
        <div className="grid grid-cols-7 gap-2">
          {days.map((d, i) => {
            const lit = cursor * 7 > i + 0.5;
            return (
              <div key={d} className="flex flex-col items-center gap-1.5">
                <div className="flex h-20 flex-col-reverse items-center gap-1">
                  {Array.from({ length: camps[i] }, (_, j) => (
                    <span
                      key={j}
                      className={`h-3 w-3 rounded-full bg-blood-400 shadow-[0_0_10px_rgb(255_92_121/0.6)] transition duration-300 ${lit ? "scale-100 opacity-100" : "scale-0 opacity-0"}`}
                      style={{ transitionDelay: `${j * 80}ms` }}
                    />
                  ))}
                </div>
                <span className={`h-1 w-full rounded-full transition ${lit ? "bg-blood-500" : "bg-white/10"}`} />
                <span className={`text-[10px] transition ${lit ? "text-white" : "text-white/35"}`}>{d}</span>
                <span className="font-mono text-[8.5px] text-white/30">08:00</span>
              </div>
            );
          })}
        </div>
        <span className="absolute -top-1 bottom-8 w-px bg-gradient-to-b from-transparent via-white/60 to-transparent" style={{ left: `${cursor * 100}%` }} />
      </div>
    </Pad>
  );
}

// ---------- 6. datasets ----------

/** Rows per district in the real dataset (31 Oct 2026). */
const DISTRICT_ROWS: [string, number][] = [
  ["Bangalore Urban", 101], ["Dakshina Kannada", 11], ["Raichur", 11], ["Mysore", 10], ["Shimoga", 10], ["Dharwad", 8],
  ["Bagalkot", 7], ["Belagavi", 7], ["Chikmagalur", 7], ["Davanagere", 7], ["Kalaburagi", 6], ["Uttara Kannada", 6],
  ["Vijayapura", 6], ["Kolar", 5], ["Koppal", 5], ["Ballari", 4], ["Bangalore Rural", 4], ["Gadag", 4], ["Udupi", 4],
  ["Yadgir", 4], ["Chitradurga", 3], ["Hassan", 3], ["Haveri", 3], ["Mandya", 3], ["Bidar", 2], ["Ramanagara", 2],
  ["Tumkur", 2], ["Vijayanagara", 2], ["Chamarajanagar", 1], ["Chikkaballapura", 1], ["Kodagu", 1],
];

function DatasetVisual({ p }: { p: number }) {
  const t = seg(p, 0.05, 0.85);
  const lit = Math.round(t * DISTRICT_ROWS.length);
  const rows = DISTRICT_ROWS.slice(0, lit).reduce((n, [, c]) => n + c, 0);
  return (
    <Pad>
      <div className="flex items-end justify-between">
        <p className="text-white">
          <b className="text-3xl tracking-tight tabular-nums">{rows}</b> <span className="text-xs text-white/50">banks</span>
        </p>
        <p className="text-right text-[11px] text-white/50">
          <b className="text-base text-white tabular-nums">{lit}</b>/31 districts
        </p>
      </div>
      <div className="grid grid-cols-8 gap-1 lg:grid-cols-11">
        {DISTRICT_ROWS.map(([d, c], i) => {
          const isLit = i < lit;
          const heat = Math.min(1, 0.25 + Math.log10(c + 1) / 2);
          return (
            <span
              key={d}
              title={`${d}: ${c} banks`}
              className={`group relative grid h-8 place-items-center rounded-md text-[8.5px] font-semibold transition duration-300 hover:z-10 hover:scale-125 ${isLit ? "text-white" : "bg-white/[0.04] text-white/20"}`}
              style={isLit ? { background: `rgb(244 42 80 / ${heat})` } : undefined}
            >
              {d.split(" ").map((w) => w[0]).join("")}
              <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-white px-1.5 py-0.5 text-[9px] whitespace-nowrap text-zinc-800 shadow group-hover:block">
                {d} · {c}
              </span>
            </span>
          );
        })}
      </div>
      <p className="text-[10px] text-white/40">name · district · area · phone · category · website</p>
    </Pad>
  );
}

// ---------- 7. research ----------

/** Sites the real research run cited (31 Oct 2026). */
const NODES: [number, number, string][] = [
  [10, 18, "pmc.ncbi"], [8, 50, "isbtweb"], [13, 82, "bmstindia"], [90, 18, "bombaybloodgroup"], [92, 50, "sankalpindia"], [87, 82, "thehindu"],
];

function ResearchVisual({ p }: { p: number }) {
  const sources = Math.round(seg(p, 0.02, 0.55) * 35);
  const steps = ["Call the Bombay group helpline", "Contact the rare-donor registry", "Test siblings first, then parents"];
  return (
    <div className="absolute inset-0">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {NODES.map(([x, y], i) => (
          <line
            key={i}
            x1={x}
            y1={y}
            x2={50}
            y2={50}
            pathLength={1}
            stroke="rgb(255 92 121 / 0.5)"
            strokeWidth={0.35}
            strokeDasharray="1"
            strokeDashoffset={1 - seg(p, 0.05 + i * 0.05, 0.3 + i * 0.05)}
          />
        ))}
      </svg>
      {NODES.map(([x, y, label], i) => (
        <span
          key={i}
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/10 px-2 py-1 font-mono text-[9px] text-white/75 ring-1 ring-white/15 transition duration-300 ${on(p, 0.03 + i * 0.05) ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
          style={{ left: `${x}%`, top: `${y}%` }}
        >
          {label}
        </span>
      ))}
      <span className="absolute top-3 left-1/2 -translate-x-1/2 font-mono text-[10px] text-white/50 tabular-nums">{sources} sources read</span>
      <div
        className={`absolute top-1/2 left-1/2 w-44 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-3 text-zinc-800 shadow-2xl transition duration-500 sm:w-52 ${on(p, 0.45) ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
      >
        <p className="text-[10px] font-semibold tracking-wide text-blood-600 uppercase">Bombay (Oh) plan</p>
        {steps.map((s, i) => (
          <p key={s} className={`mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-snug transition duration-300 ${on(p, 0.58 + i * 0.1) ? "opacity-100" : "opacity-0"}`}>
            <Check className="mt-px h-3 w-3 shrink-0 text-emerald-600" />
            {s}
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------- 8. telegram ----------

function TelegramVisual({ p }: { p: number }) {
  const searching = on(p, 0.18) && !on(p, 0.42);
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3">
      <div className="flex h-full w-full max-w-[19rem] flex-col overflow-hidden rounded-2xl bg-[#0f1a24] ring-1 ring-white/10">
        <div className="flex items-center gap-2 border-b border-white/10 bg-[#17212b] px-3 py-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-blood-600 text-[10px] font-bold">B</span>
          <span className="text-[11px]">
            <b className="block leading-tight">BloodLink</b>
            <span className="text-[9px] text-[#6ab3f3]">{searching ? "typing…" : "bot"}</span>
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden p-2.5 text-[10.5px]">
          <In show={on(p, 0.05)} className="self-end rounded-xl rounded-br-sm bg-[#2b5278] px-2.5 py-1.5">
            need O- blood near HSR
          </In>
          <In show={on(p, 0.18)} className="max-w-[90%] self-start rounded-xl rounded-bl-sm bg-[#182533] px-2.5 py-1.5">
            {on(p, 0.42) ? (
              <>
                ✅ <b>3 banks have O− now</b> · Bangalore Urban
              </>
            ) : (
              <>
                🔎 Checking eRaktKosh for O−…
                <span className="mt-0.5 block text-[#6ab3f3] underline">Watch the agent live ↗</span>
              </>
            )}
          </In>
          {[
            ["Veerayoga Institute", "6 units", "~9 km"],
            ["Command Hospital", "1 unit", "~5 km"],
            ["Baptist Hospital", "1 unit", "~14 km"],
          ].map(([n, u, km], i) => (
            <In key={n} show={on(p, 0.48 + i * 0.06)} className="max-w-[90%] self-start rounded-lg bg-[#182533] px-2.5 py-1">
              🩸 <b>{n}</b> · {u} · {km}
            </In>
          ))}
          <In show={on(p, 0.68)} className="grid grid-cols-3 gap-1">
            {["🔔 Alert", "🔄 Refresh", "📤 Share"].map((b, i) => (
              <span
                key={b}
                className={`rounded-md py-1 text-center text-[9.5px] transition ${i === 0 && on(p, 0.8) ? "scale-95 bg-[#2b5278] text-white" : "bg-white/[0.07] text-white/80"}`}
              >
                {b}
              </span>
            ))}
          </In>
          <In show={on(p, 0.86)} className="max-w-[90%] self-start rounded-xl rounded-bl-sm bg-[#182533] px-2.5 py-1.5">
            🔔 I’ll message you when new O− stock appears (48 h).
          </In>
        </div>
      </div>
    </div>
  );
}
