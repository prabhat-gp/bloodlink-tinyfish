"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Bot, External, Fish, Globe, Layers, Shield } from "./icons";
import { CountUp, Reveal, trackSpotlight, useInView } from "./motion";

/** Thanks to the people behind "Swim with TinyFish", Bengaluru, 31 Oct 2026. */
export function Sponsors() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);

  return (
    <section id="sponsors" className="relative overflow-hidden bg-ink text-white">
      <div className="hero-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-blood-600/25 blur-3xl" />

      <div className="section relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.18em] text-blood-300 uppercase">Made possible by</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Built in six hours at <span className="text-blood-300">Swim with TinyFish</span>, Bengaluru.
          </h2>
          <p className="mt-3 max-w-2xl text-white/60">
            Government health data shouldn&apos;t take an hour of phone calls to read. These are the people who gave us the
            tools and the room to fix that.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-5">
          <Reveal className="lg:col-span-3">
            <a
              href="https://www.tinyfish.ai"
              target="_blank"
              rel="noreferrer"
              onMouseMove={trackSpotlight}
              className="spotlight group flex h-full flex-col rounded-[1.5rem] bg-gradient-to-br from-white/[0.09] to-white/[0.02] p-6 ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:ring-blood-400/40 sm:p-8"
              style={{ "--spot": "rgb(244 42 80 / 0.22)" } as CSSProperties}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <span className="grid h-12 w-12 animate-float place-items-center rounded-2xl bg-blood-600 shadow-lg shadow-blood-600/40">
                    <Fish className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block text-2xl font-semibold tracking-tight">TinyFish</span>
                    <span className="block text-xs text-white/50">Title partner · web agent platform</span>
                  </span>
                </span>
                <External className="h-4 w-4 text-white/30 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
              </div>

              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/75">
                TinyFish lets agents use websites that were built for people. Every live result in BloodLink comes from a
                TinyFish agent reading eRaktKosh in a real browser, with a stealth profile and an Indian IP, and streaming it
                back so you can watch.
              </p>

              <div ref={ref} className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { n: 6, l: "APIs in one app" },
                  { n: 31, l: "districts covered" },
                  { n: 10, l: "steps per live search", p: "~" },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/5 transition group-hover:bg-white/[0.08]">
                    <p className="text-2xl font-semibold tracking-tight">
                      <CountUp to={s.n} start={inView} prefix={s.p} />
                    </p>
                    <p className="mt-0.5 text-[11px] leading-tight text-white/50">{s.l}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  [Bot, "Live browser streaming"],
                  [Layers, "Parallel async runs"],
                  [Globe, "Search · Fetch · Monitor"],
                  [Shield, "Structured, validated output"],
                ].map(([I, t]) => {
                  const Icon = I as typeof Bot;
                  return (
                    <span key={t as string} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/70 ring-1 ring-white/10">
                      <Icon className="h-3.5 w-3.5 text-blood-300" />
                      {t as string}
                    </span>
                  );
                })}
              </div>

              <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-blood-300">
                Build your own agent at tinyfish.ai
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </a>
          </Reveal>

          <div className="grid gap-4 lg:col-span-2">
            <Reveal delay={120}>
              <Partner
                initials="IR"
                name="Ignite Room"
                role="Co-organiser · developer community"
                body="A developer community of 25,000+ members across six Indian cities. They brought the builders together and ran the day."
                stat={{ n: 25000, s: "+", l: "community members" }}
              />
            </Reveal>
            <Reveal delay={220}>
              <Partner
                initials="Q"
                name="Quad AI School of Technology"
                role="Host · HSR Layout, Bengaluru"
                body="Gave us the room and lunch for six hours of building. Every demo today was built under their roof."
                stat={{ n: 6, l: "hours of building", s: "h" }}
              />
            </Reveal>
          </div>
        </div>

        <Reveal delay={150}>
          <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10 sm:flex-row sm:items-center">
            <p className="text-sm text-white/70">
              <b className="text-white">Swim with TinyFish</b> · Bengaluru · Saturday 31 October 2026 · Rs 30,000 in prizes
            </p>
            <a
              href="#top"
              className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-white/10 active:translate-y-0"
            >
              Try a live search <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Partner({ initials, name, role, body, stat }: { initials: string; name: string; role: string; body: string; stat: { n: number; s?: string; l: string } }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  return (
    <div
      ref={ref}
      onMouseMove={trackSpotlight}
      className="spotlight group h-full rounded-[1.5rem] bg-white/[0.04] p-6 ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.06]"
      style={{ "--spot": "rgb(255 255 255 / 0.08)" } as CSSProperties}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paper font-bold tracking-tight text-zinc-900 transition duration-300 group-hover:rotate-[-6deg] group-hover:scale-105">
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{name}</span>
          <span className="block text-xs text-white/50">{role}</span>
        </span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/65">{body}</p>
      <p className="mt-4 text-xl font-semibold tracking-tight">
        <CountUp to={stat.n} start={inView} suffix={stat.s} />
        <span className="ml-2 text-xs font-normal text-white/45">{stat.l}</span>
      </p>
    </div>
  );
}
