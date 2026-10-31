# BloodLink (app)

Problem, design and pitch: see [`BLOODLINK.md`](BLOODLINK.md).

## Run

```bash
npm install
cp .env.example .env.local      # BLOODLINK_MODE=mock by default: zero TinyFish credits
npm run build && npx next start -p 3010   # or: npm run dev -- -p 3010  (port 3000 is taken)
npm test                        # 29 unit tests (parser, ranking, live layer with a fake TinyFish)
```

## Event day: going live (in this order)

| # | Step | Cost |
|---|---|---|
| 1 | Put `TINYFISH_API_KEY=` in `.env.local` (keep `BLOODLINK_MODE=mock` for now) | – |
| 2 | `npm run setup -- check` (one Search call proves the key works) | free |
| 3 | Paste `buildGoal()` + the `OUTPUT_SCHEMA` (in `src/lib/server/agent.ts`) into the TinyFish playground once on eRaktKosh and check the JSON | ~$0.40 |
| 4 | `npm run setup -- dataset`: Bengaluru blood bank directory (re-run to keep waiting; reuses the id) | free (3/day) |
| 5 | `npm run setup -- research`: Bombay-group guide, cached to `.data/research.json` | free (2/day) |
| 6 | Set `BLOODLINK_MODE=live`, rebuild, restart on 3010 | – |
| 7 | One live search (Bangalore Urban, O−, Whole Blood). It also seeds the last-good cache used as a fallback. | ~$0.40 |
| 8 | In the app, Donation camps → **Turn on** creates the daily Monitor | $0.005/run |
| 9 | `npm run setup -- status` shows what is in `.data/` | free |

Budget: one search is about 25 steps ($0.40). Widen is up to 7 × ~20 steps ($2.24). The server ledger refuses runs above `BLOODLINK_DAILY_STEP_CAP`.

## Which TinyFish API does what

| Feature | TinyFish API | Where |
|---|---|---|
| Live stock search + live browser view | Web Agent `run-sse` (`STREAMING_URL` → iframe) | `src/lib/server/liveSearch.ts`, `/api/search` |
| Widen to nearby districts / components | Web Agent `run-async` × 7 + `GET /v1/runs/{id}` polling | `/api/expand` |
| Find more contacts for a bank | Search + Fetch (free) | `/api/enrich` |
| Donation camps | Search (free, cached 1 h), then Monitor once created | `/api/camps`, `/api/monitor` |
| Blood bank directory | Datasets | `/api/directory`, `npm run setup -- dataset` |
| Bombay (Oh) guide | Research (deep) | `/api/research`, `npm run setup -- research` |

Guard rails: whitelisted inputs (`validate.ts`), `output_schema` + result validation (COMPLETED ≠ success), server spend ledger (`.data/budget.json`), last-good fallback clearly labelled "cached", key never sent to the browser.

## Status

| Phase | State |
|---|---|
| P0 Scaffold | ✅ |
| P1 Core logic | ✅ parser, freshness, ranking, share text, input whitelist, agent goal |
| P2 UI on mock | ✅ |
| P3 TinyFish layer | ✅ written and unit-tested against a fake client. **Not yet run against the real API** (needs the key). |
| P4 UI redesign | ✅ dark hero, browser-frame agent view, API tags, features section, mobile layout |
| P5 Demo-proofing | ✅ simulate chips, last-good cache fallback, spend caps, setup script |

## Known limits

- Live shapes follow the docs; the first real run may need small field-name fixes (`streaming_url`, `num_of_steps`). `liveSearch.ts` already reads common variants.
- "Keep looking" re-runs from the open tab (webhooks need public https; localhost can't receive them).
- Karnataka districts only. Mock pairings of bank ↔ units are not real (clearly labelled "Demo data").

In demo mode the form shows **simulate** chips (Normal / Nothing in stock / Site error / Slow site). "Nothing in stock" empties only the first search, so Widen then finds stock nearby. "Keep looking" makes stock appear on the 2nd check (every 30 s).
