import { mockAgentRun, type Simulate } from "@/lib/mock/engine";
import { MODE } from "@/lib/mode";
import { liveStockRun } from "@/lib/server/liveSearch";
import type { AgentEvent } from "@/lib/types";
import { parseQuery } from "@/lib/validate";

export const dynamic = "force-dynamic";

const SIMULATE = new Set<Simulate>(["none", "empty", "fail", "slow", "appear"]);

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = parseQuery(params);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const simulate = SIMULATE.has(params.simulate as Simulate) ? (params.simulate as Simulate) : "none";
  const events: AsyncGenerator<AgentEvent> =
    MODE === "live" ? liveStockRun(parsed.query, req.signal, { agent: params.agent === "1" }) : mockAgentRun(parsed.query, simulate);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: AgentEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      try {
        for await (const ev of events) {
          if (req.signal.aborted) break;
          send(MODE === "mock" && ev.type === "COMPLETE" ? { ...ev, source: "mock" } : ev);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "stream error";
        send({ type: "COMPLETE", run_id: "", status: "FAILED", error: { message: msg }, timestamp: new Date().toISOString() });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
