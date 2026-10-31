"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { estimateCost, rankBanks } from "./parse";
import type { AgentEvent, SearchOutcome, SearchQuery } from "./types";

export type RunState = "idle" | "running" | "done";

export interface Progress {
  at: string;
  text: string;
}

export function useAgentSearch() {
  const [state, setState] = useState<RunState>("idle");
  const [progress, setProgress] = useState<Progress[]>([]);
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const run = useCallback(
    /** `background`: keep the previous results on screen while re-checking ("Keep looking"). */
    (q: SearchQuery, simulate = "none", background = false): Promise<SearchOutcome> => {
      stop();
      setState("running");
      setProgress([]);
      setStreamingUrl(null);
      if (!background) setOutcome(null);

      const params = new URLSearchParams({ ...q, simulate });
      const es = new EventSource(`/api/search?${params}`);
      esRef.current = es;

      return new Promise((resolve) => {
        let settled = false;
        const finish = (o: SearchOutcome) => {
          if (settled) return;
          settled = true;
          es.close();
          if (esRef.current === es) esRef.current = null;
          setOutcome(o);
          setState("done");
          resolve(o);
        };

        es.onmessage = (msg) => {
          let ev: AgentEvent;
          try {
            ev = JSON.parse(msg.data);
          } catch {
            return;
          }
          const at = new Date().toLocaleTimeString();
          if (ev.type === "STARTED") setProgress((p) => [...p, { at, text: `Agent started · run ${ev.run_id}` }]);
          if (ev.type === "STREAMING_URL") setStreamingUrl(ev.streaming_url);
          if (ev.type === "PROGRESS") setProgress((p) => [...p, { at, text: ev.purpose }]);
          if (ev.type === "COMPLETE") {
            const steps = ev.steps ?? 0;
            const costUsd = estimateCost(steps);
            // COMPLETED only means the browser ran — the goal can still have failed.
            if (ev.status !== "COMPLETED" || !ev.result || ev.result.status !== "success") {
              finish({
                kind: "failed",
                banks: [],
                reason: ev.result?.reason ?? ev.error?.message ?? "The agent could not read the site.",
                steps,
                costUsd,
                source: ev.source,
              });
              return;
            }
            const banks = rankBanks(ev.result.banks ?? [], { ...q, now: new Date() });
            finish({
              kind: banks.some((b) => b.hasRequested) ? "found" : "empty",
              banks,
              steps,
              costUsd,
              source: ev.source,
              cachedAt: ev.cached_at,
              // On a cache fallback the live failure reason is kept so the UI can say why.
              reason: ev.source === "cache" ? ev.result.reason : undefined,
            });
          }
        };

        es.onerror = () => {
          // EventSource auto-reconnects; we don't want a second run, so treat as failure.
          finish({ kind: "failed", banks: [], reason: "Connection to the search service was lost.", steps: 0, costUsd: 0 });
        };
      });
    },
    [stop],
  );

  return { state, progress, streamingUrl, outcome, run, stop };
}
