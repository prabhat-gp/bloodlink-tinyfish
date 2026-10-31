# Blood Finder: Telegram Bot + Web App

> **Status:** plan for adding a Telegram bot to our **existing Blood Finder web app** (built on another laptop).
> **Event:** Swim with TinyFish hackathon, Bangalore, 31 Oct 2026 (build window 11:00 AM to 5:00 PM).
> **Hard rule from organisers:** our project must call the **TinyFish API** from our own code.

---

## 0. How to use this document

We are **not starting from scratch**. Next steps:

1. Clone / pull the existing Blood Finder repo onto this laptop.
2. Read the repo's own README / docs **and** this file.
3. Merge the two: keep everything that already works in the web app, then add the Telegram bot,
   alerts, and shared backend described here (see **Section 9: Merge plan**).

**If the repo and this file disagree:** the repo wins on *tech stack and existing code*;
this file wins on *bot behaviour and new features*.

---

## 1. The problem (in one minute)

When a patient needs blood urgently, especially a rare group like O-negative or the Bombay group,
families call blood bank after blood bank and send messages to everyone they know.
The government already publishes live stock data on **eRaktKosh**, but the site is hard to search
on a phone in a hurry and it **has no public API**. People don't use it when it matters most.

## 2. Our solution (one line)

**Send one message, like "Need O- blood near HSR", to our Telegram bot. A TinyFish web agent checks eRaktKosh live
and replies with blood banks that have stock, their contact details and how recent the data is.
It also alerts you when stock appears.**

The **web app** stays: it gives a full-screen view (map, table, live view of the agent working).
The **Telegram bot** is where people already are in an emergency: no install, no signup, works on any phone.

---

## 3. Why Telegram (and not only the web app)

| | Web app (existing) | Telegram bot (new) |
|---|---|---|
| Install / signup | Open a link | Nothing: open chat, type |
| Emergency speed | Fill a form | One sentence |
| Alerts when stock appears | Hard (needs email/push) | Native: bot messages you |
| Share with family | Copy link | Forward the message |
| Goes live today | Yes | Yes (BotFather token in 1 min, no approval) |

WhatsApp is the long-term channel in India, but its Business API needs Meta approval.
Telegram goes live today, and the same backend can add WhatsApp later.

---

## 4. Data source (checked on 31 Oct 2026)

**eRaktKosh Blood Stock Availability** (Ministry of Health, public, no login):
`https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt`

What we observed with TinyFish Fetch:

- **Form fields:** `Select State` → `Select District` (loads after state) → `Select Blood Group` → `Select Blood Component` → **Search** button.
- **No CAPTCHA visible** on the page.
- **Blood group labels on the site:** `A+Ve, A-Ve, B+Ve, B-Ve, AB+Ve, AB-Ve, O+Ve, O-Ve, Oh+VE, Oh-VE` (Oh = Bombay group), `All Blood Groups`.
- **Components:** Whole Blood, Packed Red Blood Cells, SAGM Packed RBC, Platelet Concentrate, Single Donor Platelet,
  Random Donor Platelets, Fresh Frozen Plasma, Plasma, Cryoprecipitate, and more.
- **Results table columns:** `S.No. | Blood Bank | Category | Availability | Last Updated | Type`
- **Two result tabs:** `Government Blood Banks` and `Other Blood Banks`. **Read both.**

Secondary sources:

- **eRaktKosh Blood Bank Directory** (same site): addresses and phone numbers, if the stock table doesn't show them. Read with **Fetch**.
- **TinyFish Search:** fallback to find a hospital blood bank's phone number or page when eRaktKosh lacks it.

**Step-0 discovery task (10 min, do first):** open the stock page in Chrome DevTools → Network tab → run one search.
If the results come from a **GET URL with query parameters**, we can call that URL with **TinyFish Fetch** (free, ~1s)
for fast bot replies, and keep the Agent for the live demo and as a fallback. If it's a POST/session-only flow, the Agent is the main path.

---

## 5. How we use TinyFish

| TinyFish feature | What we use it for | Why it fits |
|---|---|---|
| **Agent** (`run-sse`, streaming) | Fill the eRaktKosh form (state → district → group → component), click Search, read **both** tabs, return JSON | Site has no API and dependent dropdowns, so it needs a real browser |
| **Live browser stream** (streaming URL from the SSE events) | "Watch the agent search" panel in the web app, plus a link in the Telegram reply | Trust, and the main wow moment for judges |
| **Structured output** (`output_schema`) | Force clean, typed JSON rows | Reliable parsing, no regex |
| **Fetch** (free) | Blood Bank Directory for phone numbers/addresses; fast path if Step-0 finds a GET endpoint | Free and fast |
| **Search** (free) | Fallback contact lookup for a hospital blood bank | Free |
| **Async / batch runs** | Refresh many alert subscriptions in one go (queue up to 100) | Alerts at scale |
| **Monitor** (optional) | Only if Step-0 finds a stable results URL: watch it and get a webhook on change | Uses a newer TinyFish feature |

**Limits to design around:**

- Agent runs **2 at a time** per account, and each run takes about **15 to 60 seconds**.
- Cost is about **$0.016 per agent step**. One search is roughly 10 to 20 steps, so **$0.15 to $0.30**. A $16 wallet covers about 50 to 100 fresh searches.
- That's why we use caching and a request queue (Section 7).

---

## 6. User experience (Telegram)

### 6.1 Commands

| Command | What it does |
|---|---|
| `/start` | Welcome + two buttons: **Find blood** and **How it works** |
| `/find` | Guided flow with buttons: blood group → component → location |
| *free text* | "need O neg platelets in HSR" → parsed automatically (LLM) |
| `/alert` | Subscribe: "message me when O-ve appears in Bengaluru Urban" |
| `/myalerts` | List and cancel active alerts |
| `/sos` | Build a **forwardable SOS card** for WhatsApp groups (patient, hospital, group, contact) |
| `/help` | Usage + disclaimer + emergency number **108** |

### 6.2 Main flow

```
User:  Need O negative blood near HSR Layout, urgent
Bot:   🔎 Checking eRaktKosh for O-Ve · Whole Blood · Bengaluru Urban…
       👀 Watch the agent live: <streaming link>
       (≈30 s; instant if someone searched this in the last 15 min)

Bot:   🩸 O-Ve · Whole Blood · Bengaluru Urban
       3 blood banks report stock (checked 1 min ago)

       1. <Blood Bank Name>: Govt
          Stock: 4 units · Updated today 09:40
          📞 <phone>  📍 <Open in Maps>
       2. ...
       3. ...

       ⚠️ Call the blood bank before travelling. Stock is as reported on eRaktKosh.

       [🔔 Alert me if more appears]  [🔄 Refresh]  [🆘 Make SOS card]  [🌐 Open in web app]
```

### 6.3 Location handling

- Buttons for **state → district** (always works).
- Optional **"📍 Share location"** button (Telegram `request_location`) → map coordinates to a district.
- Free text like "HSR", "Whitefield" or "Bangalore" → **alias map** to the exact eRaktKosh district name
  (verify the exact label, e.g. "Bangalore Urban" vs "Bengaluru Urban", in Step-0).

### 6.4 Input normalisation (LLM, small and fast)

Turn messy text into exact form values:
`"o neg" / "O-" / "O negative" → "O-Ve"`, `"platelets" → "Platelet Concentrate"` (ask if ambiguous),
`"bombay blood" → "Oh-VE"/"Oh+VE"`. Default component = **Whole Blood** if not given.
Use the LLM the repo already uses; if none, a small fast Claude model is enough.

---

## 7. Architecture: best of both worlds

```
   Telegram bot            Web app (existing)
        │                        │
        └──────────┬─────────────┘
                   ▼
        Shared backend service  ← one function: searchBloodStock(params)
          ├─ Cache (15 min per state+district+group+component)
          ├─ Request queue (max 2 agent runs at once)
          ├─ TinyFish Agent / Fetch / Search
          ├─ Alert scheduler (every 30 min for active alerts)
          └─ DB (existing DB if any, else SQLite)
```

**Key rule:** the bot and the web app call the **same** `searchBloodStock()` and share the cache.
A search from the web app makes the next Telegram reply instant, and the other way round.

### 7.1 Bridges between web app and bot

- Web app result page → **"Get alerts on Telegram"** button → deep link `https://t.me/<bot>?start=<encoded-search>`
  → bot opens with the search pre-filled → one tap to subscribe.
- Telegram reply → **"Open in web app"** → same results with map + live agent view.

### 7.2 Data model (add to existing DB)

```
users          chat_id (PK), first_seen, last_district, language
search_cache   cache_key (PK), params_json, results_json, fetched_at, tinyfish_run_id
alerts         id, chat_id, blood_group, component, state, district,
               created_at, expires_at (48h), last_notified_hash, status
runs           tinyfish_run_id, params_json, streaming_url, status, started_at, finished_at
```

### 7.3 Alert logic

1. Every 30 min, group active alerts by `(state, district, group, component)`, so one agent run serves many users.
2. Run the search (cache-aware) → compute a hash of the banks that have stock.
3. If there are **new** banks with stock compared with `last_notified_hash`, message the user and update the hash.
4. Alerts expire after 48 h (the user can renew).

### 7.4 Telegram setup

- Bot token from **@BotFather** → `TELEGRAM_BOT_TOKEN`.
- **Long polling** for the hackathon (no public URL needed). Switch to webhooks after deployment.
- Library: match the repo's language. **Python:** `python-telegram-bot` (async). **Node/TS:** `grammY` or `telegraf`.

### 7.5 Environment variables

```
TINYFISH_API_KEY=...        # never in frontend code
TELEGRAM_BOT_TOKEN=...
LLM_API_KEY=...             # for text parsing (reuse repo's if present)
CACHE_TTL_MINUTES=15
ALERT_INTERVAL_MINUTES=30
```

---

## 8. TinyFish Agent call (draft)

**URL:** `https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt`

**Goal:**

```
On this page, select State = "{state}". Wait for the District list to load, then select District = "{district}".
Select Blood Group = "{group_label}" and Blood Component = "{component}". Click Search and wait for the results table.
Extract every row from the "Government Blood Banks" tab. Then open the "Other Blood Banks" tab and extract every row there too.
For each row return: blood_bank, category, availability_text (exactly as shown), units (number if shown, else null),
last_updated, type, source_tab, and address/phone if they are shown.
If the table is empty, return an empty list. If you see an error page, CAPTCHA, or block, return {"error": "<what you saw>"}.
Return JSON only.
```

**Output schema (shape):**

```json
{
  "query": { "state": "", "district": "", "blood_group": "", "component": "" },
  "rows": [
    {
      "blood_bank": "", "category": "", "availability_text": "", "units": null,
      "last_updated": "", "type": "", "source_tab": "government|other",
      "address": null, "phone": null
    }
  ],
  "error": null
}
```

**Checks after every run:**

- A completed run doesn't mean the search worked. Treat it as a failure if `error` is set, or the text mentions captcha, blocked or access denied.
- Keep only rows that actually report stock (`units > 0` or availability text says available).
- Save `streaming_url` from the SSE events into `runs` so the web app can show the live view.

---

## 9. Merge plan (when we pull the existing repo)

**Read first, answer these from the repo:**

1. Stack: language, framework, how it runs locally, where it's deployed.
2. Where TinyFish is called today (SDK or REST? which endpoint? what goal prompt?).
3. Data source the web app already uses: eRaktKosh form, directory, something else?
4. Database or storage, if any.
5. What the UI already shows: map? table? live agent view?

**Then build in this order:**

1. **Extract** the existing search logic into one shared `searchBloodStock(params)` service (if it isn't already).
2. **Add** cache + run queue around it (Section 7).
3. **Add** `bot/` module with the Telegram handlers (Section 6), calling the shared service.
4. **Add** `alerts` + scheduler (Section 7.3).
5. **Web app upgrades:** live agent view panel, "Get alerts on Telegram" deep-link button.
6. **Pre-warm the cache** for Bengaluru Urban (common groups) before the demo.

Don't rewrite working web app code. Wrap it and reuse it.

---

## 10. Build plan for today

| Time | Goal | Priority |
|---|---|---|
| 11:00 to 11:30 | Pull repo, read docs, Step-0 discovery, BotFather token | Must |
| 11:30 to 1:00 | Shared service + cache + Agent call working end-to-end from a script | Must |
| 1:00 to 2:30 | Telegram `/find` + free-text flow + formatted replies | Must |
| 2:30 to 3:15 | Alerts (`/alert`, scheduler, notify) + web-app deep link | Should |
| 3:15 to 3:30 | `/sos` card, live-view link in bot replies | Nice |
| **3:30** | **Stop adding features.** Fix bugs, pre-warm cache, record backup demo video | Must |
| 4:00 to 5:00 | Pitch rehearsal, final demo | Must |

---

## 11. Demo script (about 2.5 minutes)

1. **Problem (20 s):** "In a blood emergency, families call 20 blood banks. The government has live stock data, but nobody can search it fast."
2. **Telegram (60 s):** type *"Need O negative blood near HSR, urgent"* → bot replies with the live-agent link → results with stock, time updated, phone numbers.
3. **Alert (20 s):** tap **Alert me** → trigger a scheduler run → notification arrives.
4. **SOS (15 s):** tap **SOS card** → forward-ready message for family WhatsApp groups.
5. **Web app (20 s):** same search, live browser view of the TinyFish agent filling the government form, map.
6. **How it works (15 s):** TinyFish Agent on a site with no API, Fetch/Search for contacts, shared cache, about ₹15 to ₹25 per fresh search and free when cached.

---

## 12. Risks and fallbacks

| Risk | Fallback |
|---|---|
| eRaktKosh slow or down during demo | Cache + pre-warmed results + recorded backup video |
| District name mismatch (Bangalore vs Bengaluru) | Alias map, verified in Step-0 |
| Only 2 agent runs at a time; many judges try at once | Queue + cache + "searching…" message with time estimate |
| Run "completes" but was blocked / empty | Validate JSON, retry once, else show "couldn't check, call 108" |
| Stale stock data on portal | Always show **Last Updated** from the portal + "call before travelling" |
| Wallet runs low | Cache aggressively; test goals on a single district first |

---

## 13. Safety and trust

- We **show** what eRaktKosh reports; we don't promise blood is available. Always show the time it was last updated.
- Every reply ends with: *call the blood bank before travelling; for emergencies call 108.*
- Store only Telegram `chat_id` and alert settings. No names or phone numbers of patients. Alerts auto-expire in 48 h.
- The SOS card is built on the user's phone from what *they* type; we don't store it.

---

## 14. Pitch line

> **"In a blood emergency, families message everyone they know. We meet them where they already are:
> one Telegram message, a TinyFish web agent that checks live government stock on a site with no API,
> and an alert the moment blood becomes available."**
