# Web app ↔ Telegram bot: sync contract

Both sessions read this file before changing anything shared. **Update it in the same commit** whenever you change something listed here.

| Branch | Owner | Owns |
|---|---|---|
| `qa-web-app` | web app session | `src/**`, `scripts/**`, `README.md`, `.env.example` |
| `qa-bot` | bot session | `bot/**`, `BLOOD_FINDER_TELEGRAM_PLAN.md` |
| `main` | merge both when green | – |

The bot **imports** `../src/lib/*` and never edits it. If the bot needs something in `src/lib`, ask the web app session (or note it under "Requests" below).

Last updated: 31 Oct 2026, ~13:45 IST, by the bot session (fast search, agreed with the team).

---

## 0. Branch rules (agreed 31 Oct ~14:35)

```
web session ──push──▶ qa-web-app ─┐
                                   ├──merge──▶ origin/main ──sync──▶ fork/main ──auto──▶ Railway (site + bot)
bot session ──push──▶ qa-bot ─────┘
```

1. Write code on your own branch (`qa-web-app` / `qa-bot`). **Never push straight to `main`.**
2. Ready to ship → merge your branch into `origin/main` (prabhat-gp).
3. Deploy → push `main` to the fork (`siddarth-ba-72/bloodlink-tinyfish`, only so Railway can see it). Railway deploys **`main`** automatically.
4. Before new work, pull `origin/main` into your branch.
5. Note each merge in the change log below.

Live: https://bloodlink-tinyfish-production.up.railway.app · Bot: @BloodLinkIndiaBot (runs on Railway now, **not** on a laptop: never start a second copy).

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
| **`liveStockRun(q, signal, { agent? })`** (`server/liveSearch.ts`) | **The search to call.** Fast path first (`fastStock`, below), the AI agent only if that fails. `{ agent: true }` forces the agent (showcase). Same `AgentEvent` stream as before. Fast-path COMPLETE has `steps: 0`, no `STREAMING_URL`, and **all banks in the district** (not only in-stock), so callers must rank with `rankBanks`. Env `BLOODLINK_SEARCH=agent` turns the fast path off. | **new (bot session)** |
| **`fastStock(q, signal?)`**, `parseStockData`, `dataPath`, `closeFastBrowser` (`server/fastStock.ts`) | eRaktKosh's form is a front for one JSON request (`nearbyBB.cnt?hmode=GETNEARBYSTOCKDETAILS&stateCode&districtCode&bloodGroup&bloodComponent`). We open eRaktKosh in a **TinyFish Browser API** session (proxy IN) and call it from inside the page; the browser stays warm `BLOODLINK_BROWSER_KEEP_WARM_MIN` (default 10) minutes. Backup: the same request straight from our server. No Playwright (tiny CDP client on Node's WebSocket). | **new (bot session)** |
| `liveAgentRun(q, signal)` | Unchanged signature. Now: cancels the TinyFish run (`POST /v1/runs/{id}/cancel`) when `signal` aborts or after **7 min** (`SEARCH_DEADLINE_MS = 420_000`), records the steps used, and yields nothing more if *your* signal aborted. | new behaviour |
| `agentRequest(q)` | `max_duration_seconds: 400`, stealth browser, proxy IN | was 240 |
| `cancelRun(id)` (`server/tinyfish.ts`) | Best-effort cancel | new |
| `telegramUrl(q, alert?)`, `TELEGRAM_BOT` (`share.ts`) | Builds `t.me/BloodLinkIndiaBot?start=[alert_]Oneg_11_572` (same payload as `bot/src/format.ts` `parseStartPayload`) | new |
| `parseQuery`, `rankBanks`, `normaliseResult`, `canSpend`, `recordSpend`, `lastGood`, `saveGood` | unchanged | – |

## 3. Links between the two

- **Search route:** `/api/search` now calls `liveStockRun` (one-line change by the bot session; `?agent=1` forces the agent). Nothing else in `src/app` or `src/components` was touched.
- **Bot → web app:** `WEB_APP_URL/?group=O-&component=11&district=572` pre-fills the form (validated with `parseQuery`). It **never auto-runs** a search, since that would cost credits. ✅ done in web app.
- **Web app → bot:** "Keep looking" card links to `t.me/BloodLinkIndiaBot?start=alert_<payload>`; the "How it works" section has an "Open @BloodLinkIndiaBot" button. ✅ done.

## 4. Real-world numbers (first live runs, 31 Oct 2026)

- eRaktKosh lists ~95 banks for Bangalore Urban, almost all "Not Available". Bangalore Urban O−/Whole Blood: 3 banks (Baptist 1, Command Hospital 1, Veerayoga 6).
- A search is ~8–10 agent steps ($0.13–0.16). It takes **2–4 minutes** when eRaktKosh is slow (~25 s per step).
- An agent run once ignored `max_duration_seconds` and kept looping, which is why we now cancel runs ourselves.
- `num_of_steps` and `streaming_url` field names are confirmed; the live stream iframes fine.
- TinyFish account limit: **2 agent runs at once** (from the bot session). The web app's Widen starts up to 7, so extra runs may queue or fail. Don't Widen while the bot is searching.

## 4b. Fast search (measured 31 Oct 2026, ~13:40)

| Search | Time | Notes |
|---|---|---|
| First search (browser starting) | **~18 s** | TinyFish says session start is 10–30 s |
| Next searches, any district/group/component | **1.2–2.1 s** | browser kept warm |
| Direct request (backup, no browser) | 0.7 s | token `abfhttf` is **not** checked on this request today |
| AI agent (fallback / showcase) | 2–4 min | unchanged |

Same answer as the agent for Bangalore Urban O−/WB (Baptist 1, Command 1, Veerayoga 6). Cost: browser $0.002/min while open (≈ $0.02 per warm 10 min), **0 agent steps**.

## 5. Bot is behind on (bot session: please fix and tick)

- [x] `bot/src/areas.ts` maps places to only ~9 districts. Add towns for **all 31** (codes in `DISTRICTS`), e.g. Mysuru → 577, Mangaluru → 575, Hubballi/Dharwad → 562, Belagavi → 555, Kalaburagi → 721, Udupi → 569, Shivamogga → 568, Davanagere → 567, Ballari → 565, Hosapete → 764. "O- in Mysuru" should search, not reply "not covered".
- [x] `bot/src/search.ts` aborts with `AbortSignal.timeout(300_000)`. A slow eRaktKosh run can need up to 7 min; raise to ≥ `420_000` (or import `SEARCH_DEADLINE_MS`), or the user gets a failure on a run that would have succeeded.
- [x] Status copy: say "this takes 2–4 minutes" rather than "60 seconds".
- [x] Empty `banks` + `status:"success"` = "no bank has it in stock right now" (now normal, since the agent filters).

## 6. Requests

Add requests here, e.g. "bot needs X exported from src/lib".

- **bot → web (please):** switch Widen (`/api/expand`) from 7 agent runs to `fastStock` for each target. 7 districts become ~2 s each, about $0, and it no longer competes with the bot for the 2 agent slots.
- **bot → web (please):** the agent panel has no live stream on the fast path. Suggest copy like "Read live from eRaktKosh in 1.8 s via a TinyFish browser", plus a "Watch the AI agent do it" toggle (`/api/search?…&agent=1`) for the demo. The bot has this as a button.
- ~~**bot → web:** a `src/lib/server` helper that returns the statewide directory (Dataset rows: name, phone, area, district code) without going through `/api/directory`. Since the agent now returns only in-stock banks, the bot's "nearest blood bank" list and its "banks to call" list (when nothing is in stock) are empty or short. The directory would fill both with phone numbers.~~ Not needed now: the fast path returns every bank in the district.

## 7. Change log

| When (IST) | Who | What |
|---|---|---|
| 31 Oct 10:20 | web | Initial push `a86e64d` (V1, mock + live layer). Branches `qa-web-app`, `qa-bot` created from it. |
| 31 Oct ~11:50 | bot | `qa-bot`: `bot/` workspace, parser, places, end-to-end bot in mock mode (`48223e1`). |
| 31 Oct ~15:20 | bot | Merged to `main`: prod clean-up (README, .env.example, dead code, eslint script), ultrareview dark-mode fixes (reds by job, WCAG AA), **Instrument Sans** typography + min 12px type scale, dark mode toggle. **Web session: pull `main` before UI work.** |
| 31 Oct ~14:55 | bot | UI redesign "Editorial Warm" on `main` (user's pick C): Fraunces + Manrope, warm palette via theme tokens (blood-*, zinc-*, canvas, paper), cream hero, `.section` spacing, shorter How-it-works chapters, micro-interactions. **Web session: pull `main` before further UI work.** Untracked `public/ui-mockups/` on the bot laptop was left out (not ours). |
| 31 Oct ~14:35 | bot | `main` fast-forwarded to `qa-bot` (web V1 + bot + fast search + Railway config). Deploys from `main` via the fork. Branch rules = section 0. |
| 31 Oct ~13:55 | bot | Bot results get "🧪 Other component": all 8 `COMPONENTS` (same codes as the web dropdown), one tap each. Typed names (PRBC, PCV, SDP, RDP, FFP, cryo, SAGM, plasma, platelets) were already supported. |
| 31 Oct ~13:45 | bot | Fast search in `src/lib`: `fastStock.ts` (TinyFish browser + eRaktKosh's own data request, direct backup), `liveStockRun` (fast → agent), `/api/search` switched, 8 new tests. Bot uses it (+ "👀 Watch the AI agent" button, copy "a few seconds"). |
| 31 Oct ~13:10 | bot | `qa-bot`: merged `qa-web-app`; bot is live only (demo removed); places for all 31 districts (~170 towns/areas, pins anywhere in Karnataka); search backstop = `SEARCH_DEADLINE_MS` + 60 s; "2–4 minutes" status copy; "nearest" now says "with blood in stock". |
| 31 Oct 12:40 | web | `qa-web-app`: went live; 31 districts; filtered agent goal; run cancel + 7-min deadline; statewide Datasets directory; cleaned Research; URL pre-fill + Telegram links; scroll-driven "How it works" section (8 chapters incl. the bot); partners section. |
