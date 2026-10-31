#!/usr/bin/env node
/**
 * One-off TinyFish setup for event day. Each command is explicit because some cost credits.
 *
 *   npm run setup -- check      free   Search call: proves the key works
 *   npm run setup -- dataset    free   Datasets (beta, 3 runs/24h): Karnataka blood bank directory
 *   npm run setup -- research   free×2/day then $2   Deep research: Bombay blood group guide
 *   npm run setup -- status     free   show what's in .data/
 *
 * The camps Monitor is created from the app (button in the camps card), not here.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const KEY = process.env.TINYFISH_API_KEY?.trim();
const AGENT = "https://agent.tinyfish.ai";
const DATA = path.join(process.cwd(), ".data");

const save = async (name, data) => {
  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, name), JSON.stringify(data, null, 2));
  console.log(`  saved .data/${name}`);
};
const load = async (name) => JSON.parse(await readFile(path.join(DATA, name), "utf8").catch(() => "null"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, init = {}) {
  if (!KEY) throw new Error("TINYFISH_API_KEY missing from .env.local");
  const res = await fetch(url, { ...init, headers: { "X-API-Key": KEY, "Content-Type": "application/json", ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Markdown memo → card content: first real paragraph, first numbered actions, cited URLs. */
function digestResearch(deep) {
  const text = String(deep.result ?? "");
  const clean = (l) => l.replace(/\*\*/g, "").replace(/\s*(\[\d+\])+/g, "").trim();
  const paras = text.split(/\n\s*\n/).map((p) => p.trim());
  const summary = clean(paras.find((p) => !/^(#|\*\*[^*]+:\*\*|---|\d+\.|[-*] )/.test(p) && p.length > 80) ?? "").slice(0, 600);
  const steps = text
    .split("\n")
    .filter((l) => /^\s*\d+\.\s+/.test(l))
    .map((l) => clean(l.replace(/^\s*\d+\.\s+/, "")))
    .filter((l) => l.length > 20)
    .slice(0, 6);
  const citations = (deep.citations ?? [])
    .map((c) => (typeof c === "string" ? { url: c } : { url: c.url, title: c.title }))
    .filter((c) => /^https?:/.test(c.url ?? ""))
    .slice(0, 8)
    .map((c) => ({ title: c.title ?? new URL(c.url).hostname.replace(/^www\./, ""), url: c.url }));
  return { summary, steps, full: text, citations, at: new Date().toISOString() };
}

const commands = {
  async check() {
    const p = new URLSearchParams({ query: "eRaktKosh blood stock availability", location: "IN", language: "en" });
    const r = await api(`https://api.search.tinyfish.ai?${p}`);
    console.log(`✓ key works. Search returned ${r.results?.length ?? 0} results, e.g. "${r.results?.[0]?.title}"`);
  },

  async dataset() {
    const existing = await load("dataset.json");
    let id = existing?.id;
    if (!id) {
      const r = await api(`${AGENT}/v1/datasets`, {
        method: "POST",
        body: JSON.stringify({
          prompt:
            "Licensed blood banks / blood centres in every district of Karnataka, India (all 31 districts, " +
            "including Bengaluru Urban). Columns: name, district, area (locality / town), phone (public contact number), " +
            "category (Govt/Private/Charitable), website.",
          target_rows: 250,
        }),
      });
      id = r.id ?? r.dataset?.id;
      await save("dataset.json", { id, createdAt: new Date().toISOString() });
      console.log(`  dataset ${id} started`);
    }
    for (let i = 0; i < 60; i++) {
      const d = await api(`${AGENT}/v1/datasets/${id}`);
      console.log(`  status: ${d.status}`);
      if (d.status === "ready") {
        const rows = await api(`${AGENT}/v1/datasets/${id}/rows?limit=5`);
        console.log(`✓ ready. Columns: ${(rows.columns ?? []).map((c) => c.name ?? c).join(", ")}`);
        return;
      }
      if (["failed", "cancelled"].includes(d.status)) throw new Error(`dataset ${d.status}`);
      await sleep(15_000);
    }
    console.log("Still populating; re-run this command later to keep waiting (it reuses the id).");
  },

  async research() {
    const state = await load("research-run.json");
    let id = state?.id;
    if (!id) {
      const r = await api(`${AGENT}/v1/automation/run-research-async`, {
        method: "POST",
        body: JSON.stringify({
          mode: "deep",
          query:
            "A patient in Bengaluru, India urgently needs Bombay (Oh) phenotype blood. What are the fastest, " +
            "concrete steps for the family: which rare-donor registries and donor networks in India to contact, " +
            "how frozen rare units work, and who in the family to test first? Keep it practical and cite sources.",
        }),
      });
      id = r.research_run_id;
      await save("research-run.json", { id, startedAt: new Date().toISOString() });
    }
    for (let i = 0; i < 80; i++) {
      const r = await api(`${AGENT}/v1/research-run/${id}`);
      console.log(`  status: ${r.status}`);
      if (r.status === "COMPLETED") {
        await save("research.json", digestResearch(r.deep_result ?? {}));
        console.log("✓ research cached");
        return;
      }
      if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(r.status)) throw new Error(`research ${r.status}`);
      await sleep(15_000);
    }
    console.log("Still running; re-run this command later (it reuses the run id, no extra cost).");
  },

  async status() {
    for (const f of ["budget.json", "dataset.json", "research.json", "monitor.json", "search-cache.json"]) {
      const v = await load(f);
      console.log(`${f.padEnd(18)} ${v ? "✓" : "–"}${f === "budget.json" && v ? `  ${v.steps} steps today (${v.day})` : ""}`);
    }
  },
};

const cmd = process.argv[2];
if (!commands[cmd]) {
  console.log("usage: npm run setup -- check | dataset | research | status");
  process.exit(1);
}
commands[cmd]().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
