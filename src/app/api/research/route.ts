import { MOCK_RESEARCH } from "@/lib/mock/fixtures";
import { MODE } from "@/lib/mode";
import { readJson } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * Bombay-group guide. Produced ONCE by TinyFish Research (`npm run setup -- research`, deep mode,
 * 2 free/day) and cached in .data/research.json. This route never starts a research run.
 */
export async function GET() {
  if (MODE === "mock") return Response.json({ ...MOCK_RESEARCH, source: "mock" });
  const r = await readJson<typeof MOCK_RESEARCH & { at?: string } | null>("research.json", null);
  if (!r) return Response.json({ ...MOCK_RESEARCH, source: "mock", note: "Run: npm run setup -- research" });
  return Response.json({ ...r, source: "research" });
}
