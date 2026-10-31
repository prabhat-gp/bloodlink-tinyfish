"use client";

import { useEffect, useRef } from "react";
import type { Progress, RunState } from "@/lib/useAgentSearch";
import { Fish } from "./icons";

interface Props {
  state: RunState;
  progress: Progress[];
  streamingUrl: string | null;
  mock: boolean;
}

/** Browser-window frame around the TinyFish live stream (or a placeholder in demo mode). */
export function AgentPanel({ state, progress, streamingUrl, mock }: Props) {
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [progress]);

  const running = state === "running";
  const last = progress.at(-1)?.text;
  // The stream only shows "session completed" once the run ends, so drop it and collapse.
  const showStream = !!streamingUrl && running;

  return (
    <section className="overflow-hidden rounded-[1.25rem] bg-ink text-white shadow-[0_20px_50px_-20px_rgb(12_12_16/0.5)]" aria-live="polite">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-1.5 font-mono text-xs text-white/60">
          <span className="text-emerald-400">●</span>
          <span className="truncate">eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt</span>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase ${
            running ? "bg-blood-600/20 text-blood-300" : state === "done" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/50"
          }`}
        >
          {running && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blood-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blood-400" />
            </span>
          )}
          {running ? "Live" : state === "done" ? "Done" : "Standby"}
        </span>
      </div>

      <div className={`relative w-full bg-[#15151c] transition-[aspect-ratio] duration-500 ${state === "done" ? "aspect-[16/4]" : state === "idle" ? "aspect-[16/5]" : "aspect-[16/9] max-h-[62vh]"}`}>
        {showStream ? (
          <iframe src={streamingUrl!} title="TinyFish agent live browser" className="absolute inset-0 h-full w-full bg-paper" sandbox="allow-scripts allow-same-origin" />
        ) : (
          <div className="absolute inset-0 overflow-hidden">
            {/* Wireframe of the eRaktKosh form being filled in */}
            <div className={`absolute inset-0 ${state === "done" ? "hidden" : "flex"} flex-col gap-3 p-6 opacity-60 sm:p-8`}>
              <div className="h-3 w-40 rounded bg-white/15" />
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`h-8 rounded-md border ${running && progress.length > i + 1 ? "border-blood-400/60 bg-blood-500/15" : "border-white/10 bg-white/5"} transition-colors duration-500`} />
                ))}
              </div>
              <div className="mt-2 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`h-5 rounded ${running && progress.length > 6 ? "bg-white/10" : "bg-white/[0.04]"} transition-colors duration-700`} style={{ width: `${92 - i * 7}%` }} />
                ))}
              </div>
            </div>
            {running && <div className="absolute inset-x-0 top-0 h-10 animate-scan bg-gradient-to-b from-transparent via-blood-500/25 to-transparent" />}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <span className={`grid h-14 w-14 place-items-center rounded-2xl bg-white/10 backdrop-blur ${running ? "animate-pulse" : ""}`}>
                <Fish className="h-7 w-7 text-blood-300" />
              </span>
              <p className="max-w-xs px-4 text-sm text-white/80">
                {state === "idle"
                  ? "A TinyFish agent will open eRaktKosh and fill in the form for you."
                  : running
                    ? last ?? "Starting agent…"
                    : "Run complete. Results below."}
              </p>
              {mock && state !== "done" && <p className="text-[11px] text-white/40">Live browser video streams here in live mode</p>}
            </div>
          </div>
        )}
      </div>

      {progress.length > 0 && (
        <ol ref={logRef} className="scrollbar-thin max-h-36 space-y-1 overflow-y-auto border-t border-white/10 px-4 py-3 font-mono text-[11.5px] text-white/60">
          {progress.map((p, i) => (
            <li key={i} className="flex gap-3 animate-rise">
              <span className="shrink-0 text-white/30 tabular-nums">{p.at}</span>
              <span className={i === progress.length - 1 && running ? "text-white" : ""}>{p.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
