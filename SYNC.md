# Web app ↔ Telegram bot: sync contract

Both sessions read this file before changing anything shared. **Update it in the same commit** whenever you change something listed here.

| Branch | Owner | Owns |
|---|---|---|
| `qa-web-app` | web app session | `src/**`, `scripts/**`, `README.md`, `.env.example` |
| `qa-bot` | bot session | `bot/**`, `BLOOD_FINDER_TELEGRAM_PLAN.md` |
| `main` | merge both when green | – |

The bot **imports** `../src/lib/*` and never edits it. If the bot needs something in `src/lib`, ask the web app session (or note it under "Requests" below).

Last updated: 31 Oct 2026, ~13:10 IST, by the bot session.

---

## 1. Shared state

| Thing | Value | Where |
|---|---|---|
| Mode + key | `BLOODLINK_MODE=live`, one `TINYFISH_API_KEY` | root `.env.local` (never committed) |
| Spend ledger | `.data/budget.json`, cap `BLOODLINK_DAILY_STEP_CAP` (250 steps ≈ $4/day, IST) | `src/lib/server/budget.ts` |
| Last-good cache | `.data/search-cache.json`, key `state:district:component` | `src/lib/server/agent.ts` |
| Directory | Dataset `.data/dataset.json`: 250 banks, **all 31 districts** (dataset uses new spellings: Mysuru, Shivamogga, Tumakuru…) | `/api/directory` |
| Bombay guide | `.data/research.json` (summary, steps, citations) | `/api/research` |
| Bot files | `.data/bot-*.json` | `bot/src/store.ts` |

Spent so far today: ~$0.45 (3 live runs).

## 2. Shared code contract (`src/lib`)

| Export | Contract | Changed today |
|---|---|---|
| `DISTRICTS` (`eraktkosh.ts`) | **31 Karnataka districts**, eRaktKosh codes (e.g. 572 Bangalore Urban, 577 Mysore, 721 Kalaburagi, 764 Vijayanagara). Codes are numeric strings, so object order is code order; sort by name for display. | was 8 → now 31 |
| `NEIGHBOURS` | Every district → bordering districts (symmetric). Bangalore Urban: `583 584 581 582 571`. | was 3 entries → now 31 |
| `buildGoal(q)` | The agent types `"<group label>:"` (e.g. `O-Ve:`) into the stock table's own Search box, so **only in-stock banks come back**. An empty list with `status:"success"` means "none in stock". | new |
| `liveAgentRun(q, signal)` | Unchanged signature. Now: cancels the TinyFish run (`POST /v1/runs/{id}/cancel`) when `signal` aborts or after **7 min** (`SEARCH_DEADLINE_MS = 420_000`), records the steps used, and yields nothing more if *your* signal aborted. | new behaviour |
| `agentRequest(q)` | `max_duration_seconds: 400`, stealth browser, proxy IN | was 240 |
| `cancelRun(id)` (`server/tinyfish.ts`) | Best-effort cancel | new |
| `telegramUrl(q, alert?)`, `TELEGRAM_BOT` (`share.ts`) | Builds `t.me/BloodLinkIndiaBot?start=[alert_]Oneg_11_572` (same payload as `bot/src/format.ts` `parseStartPayload`) | new |
| `parseQuery`, `rankBanks`, `normaliseResult`, `canSpend`, `recordSpend`, `lastGood`, `saveGood` | unchanged | – |

## 3. Links between the two

- **Bot → web app:** `WEB_APP_URL/?group=O-&component=11&district=572` pre-fills the form (validated with `parseQuery`). It **never auto-runs** a search, since that would cost credits. ✅ done in web app.
- **Web app → bot:** "Keep looking" card links to `t.me/BloodLinkIndiaBot?start=alert_<payload>`; the "How it works" section has an "Open @BloodLinkIndiaBot" button. ✅ done.

## 4. Real-world numbers (first live runs, 31 Oct 2026)

- eRaktKosh lists ~95 banks for Bangalore Urban, almost all "Not Available". Bangalore Urban O−/Whole Blood: 3 banks (Baptist 1, Command Hospital 1, Veerayoga 6).
- A search is ~8–10 agent steps ($0.13–0.16). It takes **2–4 minutes** when eRaktKosh is slow (~25 s per step).
- An agent run once ignored `max_duration_seconds` and kept looping, which is why we now cancel runs ourselves.
- `num_of_steps` and `streaming_url` field names are confirmed; the live stream iframes fine.
- TinyFish account limit: **2 agent runs at once** (from the bot session). The web app's Widen starts up to 7, so extra runs may queue or fail. Don't Widen while the bot is searching.

## 5. Bot is behind on (bot session: please fix and tick)

- [x] `bot/src/areas.ts` maps places to only ~9 districts. Add towns for **all 31** (codes in `DISTRICTS`), e.g. Mysuru → 577, Mangaluru → 575, Hubballi/Dharwad → 562, Belagavi → 555, Kalaburagi → 721, Udupi → 569, Shivamogga → 568, Davanagere → 567, Ballari → 565, Hosapete → 764. "O- in Mysuru" should search, not reply "not covered".
- [x] `bot/src/search.ts` aborts with `AbortSignal.timeout(300_000)`. A slow eRaktKosh run can need up to 7 min; raise to ≥ `420_000` (or import `SEARCH_DEADLINE_MS`), or the user gets a failure on a run that would have succeeded.
- [x] Status copy: say "this takes 2–4 minutes" rather than "60 seconds".
- [x] Empty `banks` + `status:"success"` = "no bank has it in stock right now" (now normal, since the agent filters).

## 6. Requests

Add requests here, e.g. "bot needs X exported from src/lib".

- **bot → web:** a `src/lib/server` helper that returns the statewide directory (Dataset rows: name, phone, area, district code) without going through `/api/directory`. Since the agent now returns only in-stock banks, the bot's "nearest blood bank" list and its "banks to call" list (when nothing is in stock) are empty or short. The directory would fill both with phone numbers.

## 7. Change log

| When (IST) | Who | What |
|---|---|---|
| 31 Oct 10:20 | web | Initial push `a86e64d` (V1, mock + live layer). Branches `qa-web-app`, `qa-bot` created from it. |
| 31 Oct ~11:50 | bot | `qa-bot`: `bot/` workspace, parser, places, end-to-end bot in mock mode (`48223e1`). |
| 31 Oct ~13:10 | bot | `qa-bot`: merged `qa-web-app`; bot is live only (demo removed); places for all 31 districts (~170 towns/areas, pins anywhere in Karnataka); search backstop = `SEARCH_DEADLINE_MS` + 60 s; "2–4 minutes" status copy; "nearest" now says "with blood in stock". |
| 31 Oct 12:40 | web | `qa-web-app`: went live; 31 districts; filtered agent goal; run cancel + 7-min deadline; statewide Datasets directory; cleaned Research; URL pre-fill + Telegram links; scroll-driven "How it works" section (8 chapters incl. the bot); partners section. |
