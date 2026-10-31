# BloodLink

Find a blood bank that has your blood group **in stock right now**, for all 31 districts of Karnataka.
BloodLink reads the government's live eRaktKosh stock through TinyFish and ranks banks by stock, freshness and distance.

- **Web app:** https://bloodlink-tinyfish-production.up.railway.app
- **Telegram bot:** [@BloodLinkIndiaBot](https://t.me/BloodLinkIndiaBot) (code and docs in [`bot/`](bot/README.md))
- Problem, design and pitch: [`BLOODLINK.md`](BLOODLINK.md) · Bot plan: [`BLOOD_FINDER_TELEGRAM_PLAN.md`](BLOOD_FINDER_TELEGRAM_PLAN.md) · Team sync and branch rules: [`SYNC.md`](SYNC.md) (read before touching `src/lib`)

## How a search works

| Step | What | Time | Cost |
|---|---|---|---|
| 1 | **Fast path:** a TinyFish Browser API session (India proxy) opens eRaktKosh and calls the site's own stock request from inside the page. The browser stays warm for 10 minutes. | ~2 s warm, ~15 s cold | ~$0.002/min while open |
| 2 | Backup: the same request straight from our server | <1 s | free |
| 3 | Fallback and showcase: the TinyFish **AI agent** fills the form (`run-sse`, live stream; stopped after 7 min) | 2–4 min | ~$0.15 (8–10 steps) |

The same `liveStockRun()` (`src/lib/server/liveSearch.ts`) serves the web app and the bot. Results are cached 15 minutes per district + component + group.

| Feature | TinyFish API | Where |
|---|---|---|
| Live stock search | Browser API, Web Agent as fallback (`?agent=1` forces it) | `src/lib/server/fastStock.ts`, `liveSearch.ts`, `/api/search` |
| Widen to nearby districts / components | Web Agent `run-async` + `GET /v1/runs/{id}` | `/api/expand` |
| More contacts for a bank | Search + Fetch (free) | `/api/enrich` |
| Donation camps | Search (cached 1 h), then Monitor | `/api/camps`, `/api/monitor` |
| Blood bank directory | Datasets (250 banks, all 31 districts) | `/api/directory`, `npm run setup -- dataset` |
| Bombay (Oh) guide | Research | `/api/research`, `npm run setup -- research` |

Guard rails: whitelisted inputs (`validate.ts`), output schema + result validation (COMPLETED ≠ success), a server spend ledger with a daily cap (`.data/budget.json`), a last-good fallback labelled "cached", and the API key never reaches the browser.

## Run locally

```bash
npm install
cp .env.example .env.local     # add TINYFISH_API_KEY; BLOODLINK_MODE=mock costs nothing
npm run dev -- -p 3010
npm test                       # web + shared tests (bot: cd bot && npm test)
npm run lint && npm run typecheck
npm run setup -- check         # one free Search call proves the key works
```

`BLOODLINK_MODE=mock` serves sample data shaped from a real snapshot, clearly labelled "Demo data", with simulate chips (nothing in stock, site error, slow site). Production runs `live`.

## Deploy (Railway)

One service runs the website and the bot (`railway.json`, `scripts/start-all.mjs`), with a volume at `/app/.data` for the cache, spend ledger and bot alerts. Railway deploys **`main`** from the fork `siddarth-ba-72/bloodlink-tinyfish`. Ship by merging into `main` (`SYNC.md`, section 0).

Required variables: `TINYFISH_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `BLOODLINK_MODE=live`, `WEB_APP_URL`. Optional ones are in `.env.example`.

## Known limits

- The fast path relies on eRaktKosh not checking its anti-scraping token on the stock request (true on 31 Oct 2026). If that changes, searches fall back to the AI agent automatically.
- Stock is what banks report on eRaktKosh; some timestamps are months old and are flagged as stale. Always call before travelling.
- "Keep looking" on the web re-runs from the open tab; the bot's alerts run on the server every 30 minutes.
- `npm audit` flags `postcss` inside Next.js's build tooling (build-time only, processes our own CSS). The fix needs Next 16; accepted for now.
