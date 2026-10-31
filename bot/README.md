# BloodLink Telegram bot

Send one message, like **"need O- blood near HSR"**, and get blood banks that have stock, with phone, map link and how fresh the data is.
Spec: [`../BLOOD_FINDER_TELEGRAM_PLAN.md`](../BLOOD_FINDER_TELEGRAM_PLAN.md). The bot's behaviour follows that plan, and its tech follows this repo.

## Run

```bash
cd bot
npm install
cp .env.example .env.local     # add TELEGRAM_BOT_TOKEN from @BotFather
npm run dev                    # long polling, restarts on save
npm test
```

TinyFish key and `BLOODLINK_MODE` (mock / live) come from the web app's `../.env.local`, so both share one key and one spend cap.

## Layout

```
bot/
  src/
    index.ts      start bot + alert loop
    config.ts     env settings
    parser.ts     free text → group, component, area (rule-based)
    areas.ts      area → district + map point
    search.ts     searchBloodStock(): cache, join identical searches, max 2 runs
    handlers.ts   Telegram messages, buttons, location
    format.ts     reply text and buttons
    alerts.ts     "Alert me" + 30-min re-check
    store.ts      chat state + alerts in ../.data/bot-*.json
  test/           unit tests
```

## Rules for working in this repo

- Bot code lives only in `bot/`. The web app (`src/`) is owned by the other session.
- The bot **imports** `../src/lib/*` (search, parsing, ranking, spend cap) and never edits it.
- The bot runs from the repo root, so it shares `.data/` (search cache, spend ledger) with the web app on the same machine.
