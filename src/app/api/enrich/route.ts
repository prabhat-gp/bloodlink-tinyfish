import { mockEnrich } from "@/lib/mock/fixtures";
import { MODE } from "@/lib/mode";
import { extractPhones } from "@/lib/parse";
import { readJson, writeJson } from "@/lib/server/store";
import { fetchPages, search, TinyFishError } from "@/lib/server/tinyfish";

export const dynamic = "force-dynamic";

type Enrich = ReturnType<typeof mockEnrich>;

/**
 * "Find more contacts" for one bank: free TinyFish Search for its page, then free Fetch of the
 * top results, then pull phone numbers out of the text. Cached per bank name.
 */
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  // Names come from our own results, but this route is public: keep the query tame.
  if (!name || name.length > 120 || !/^[\w\s.,&()'/-]+$/.test(name)) return Response.json({ error: "bad name" }, { status: 400 });
  if (MODE === "mock") {
    await new Promise((r) => setTimeout(r, 900));
    return Response.json({ ...mockEnrich(name), source: "mock" });
  }

  const cache = await readJson<Record<string, Enrich>>("enrich.json", {});
  if (cache[name]) return Response.json({ ...cache[name], source: "cache" });

  try {
    const hits = (await search(`${name} blood bank Bengaluru contact phone`)).slice(0, 3);
    const pages = hits.length ? await fetchPages(hits.map((h) => h.url), "Find blood bank contact numbers") : { results: [] };
    // Web pages are noisy: keep only Indian mobiles and Bengaluru (080) landlines.
    const phones = [...new Set((pages.results ?? []).flatMap((p) => extractPhones(p.text ?? "")))]
      .filter((p) => /^[6-9]\d{9}$|^080\d{8}$/.test(p))
      .slice(0, 4);
    const out: Enrich = { phones, sources: hits.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })) };
    cache[name] = out;
    await writeJson("enrich.json", cache);
    return Response.json({ ...out, source: "live" });
  } catch (e) {
    return Response.json({ error: e instanceof TinyFishError ? e.message : "Lookup failed" }, { status: 502 });
  }
}
