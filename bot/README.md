# BloodLink Telegram bot · [@BloodLinkIndiaBot](https://t.me/BloodLinkIndiaBot)

Send one message, like **"need O- blood near HSR"**, and get blood banks that have it in stock, with phone, map link and how fresh the data is.
Spec: [`../BLOOD_FINDER_TELEGRAM_PLAN.md`](../BLOOD_FINDER_TELEGRAM_PLAN.md). The bot's behaviour follows that plan, and its tech follows this repo.

## Run

```bash
cd bot
npm install
cp .env.example .env.local     # TELEGRAM_BOT_TOKEN from @BotFather, TELEGRAM_BOT_USERNAME=BloodLinkIndiaBot
npm run dev                    # long polling, restarts on save
npm test                       # parser, places, search layer + end-to-end conversations (fake Telegram)
```

`TINYFISH_API_KEY` and `BLOODLINK_MODE` (mock / live) come from the web app's `../.env.local`, so both share one key, one spend cap and one `.data/` folder.
Only one copy of the bot can run per token. A second copy fails with "already running".

## What people can do

| They send | The bot |
|---|---|
| `need O- blood near HSR` | Live status (edits itself, "Watch the agent live" link), then banks with O− stock: units, freshness, ~km, phone, map |
| `need blood` | Asks group → place (location button or typed area), one question at a time |
| `O blood`, `platelets` | Asks only what's ambiguous: O+ or O−? RDP or SDP? |
| `nearest blood bank` / a location pin / `Koramangala` | Blood banks closest first, with what they have in stock |
| `alert me when O- is available in HSR` | Results + subscribes (checks every 30 min for 48 h, messages only about new banks) |
| `O- in Chennai` | "Not covered yet" + eRaktKosh link + 108 |
| Buttons | 🔔 Alert · 🔄 Refresh · 📤 Share (forwardable + WhatsApp) · 📋 Show all · 🔍 Nearby districts · 🧪 Other component (ask doctor) |
| `/alerts` `/help` `/cancel` | Manage alerts, how it works, reset |
| `/checknow` (hidden) | Runs this chat's alert check now. In mock mode new stock "appears", for the demo |

## Links between the web app and the bot

- **Web app → bot:** `https://t.me/BloodLinkIndiaBot?start=<payload>`
  - `Oneg_11_572` shows that search (group: `Apos Aneg Bpos Bneg ABpos ABneg Opos Oneg Ohpos Ohneg`, then component code, then district code)
  - `alert_Oneg_11_572` shows it **and** turns on the alert
- **Bot → web app:** `WEB_APP_URL/?group=O-&component=11&district=572`. The button only shows when `WEB_APP_URL` is not localhost, because Telegram rejects localhost links. The web app should read these params to pre-fill the form.

## Layout

```
bot/
  src/
    index.ts      start: bot profile + menu, alert loop, long polling
    bot.ts        builds the bot (shared with tests)
    handlers.ts   the conversation: ask only what's missing, then search
    parser.ts     free text → group, component, place, intent (rule-based)
    areas.ts      ~110 areas, landmarks, pincodes, towns → district + map point
    search.ts     searchBloodStock(): 15-min cache, joins identical searches, max 2 agent runs
    format.ts     every message and button
    alerts.ts     "Alert me" + 30-min re-check
    store.ts      chat state + alerts in ../.data/bot-*.json (chat IDs only)
  test/           *.test.ts (also run by the root npm test) · *.e2e.ts (bot only)
```

## Rules for working in this repo

- Bot code lives only in `bot/`. The web app (`src/`) is owned by the other session.
- The bot **imports** `../src/lib/*` (agent call, parsing, ranking, spend cap) and never edits it.
- Going live: set `BLOODLINK_MODE=live` in `../.env.local` and restart both the web app and the bot.
