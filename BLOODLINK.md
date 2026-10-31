# 🩸 BloodLink — Find blood in an emergency, in 60 seconds

> **Swim with TinyFish Hackathon · Bangalore · 31 Oct 2026**
> Built on TinyFish: Agent · Live Preview · Batch Runs · Webhooks · Monitor · Search · Fetch · Datasets · Research · MCP

---

## 1. The problem (in one line)

**India publishes live blood stock for every blood bank, but nobody can use it at 2 AM.** So families still find blood by phoning hospitals one by one.

### What we found on the live site (31 Oct 2026, Bangalore Urban, Whole Blood, All groups)

| Finding | Number |
|---|---|
| Blood banks listed | **94** (split across 10 pages) |
| Banks with *any* whole blood in stock | **only 10 (11%)** |
| Banks with **O−** whole blood | **4**, mostly **1 unit** each |
| Oldest "last updated" timestamp | **5 March 2026**, about 8 months stale |
| What the other 84 banks say | *"Not Available — Search for another Component"* |

### Why it's painful today

To use **eRaktKosh** (the Government of India's blood stock portal), a panicked relative has to:

1. Find the portal (most people don't know it exists).
2. Work through 4 dropdowns: **State → District → Blood Group → Component**.
3. Page through **10 pages** of results.
4. When nothing is found, **repeat by hand** for every other component (Packed RBC, SAGM RBC…) and every nearby district.
5. Judge for themselves whether a "last updated" date is fresh enough to trust.
6. Copy phone numbers and start calling.

### Why only an agent can fix this

- **No public API.** The data exists only behind the web form.
- **Anti-scraping token.** The site's data request carries an obfuscated token (`abfhttf=…`), so a plain HTTP scraper breaks.
- **Fragile legacy form.** It's a jQuery form: setting dropdown values from code is silently ignored, and only real UI interaction works. That's exactly what TinyFish's browser agent does.

### Emotional hook for the pitch

The dropdown includes the **Bombay blood group (Oh+ / Oh−)**, found in roughly 1 in 10,000 Indians. For those patients, finding a unit is a matter of life or death.

---

## 2. The solution

**BloodLink** sends agents to do the whole eRaktKosh search, retries, and freshness checks in about 60 seconds, then hands back a **ranked list of blood banks to call**.

### User flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. ENTER    Blood group · Component · District · [Urgent toggle] │
├──────────────────────────────────────────────────────────────────┤
│ 2. WATCH    Live iframe: the agent operating eRaktKosh           │
├──────────────────────────────────────────────────────────────────┤
│ 3. RESULTS  Ranked cards:                                        │
│             • Units available (O−: 6)                            │
│             • Freshness: 🟢 <6h  🟡 <24h  🔴 stale               │
│             • Govt / Private / Red Cross / Charitable            │
│             • 📞 Tap to call   🗺️ Maps link                       │
├──────────────────────────────────────────────────────────────────┤
│ 4. NOTHING FOUND? → automatic widened search                     │
│             • Neighbouring districts in parallel                 │
│             • Other components (⚠️ "ask your doctor")            │
├──────────────────────────────────────────────────────────────────┤
│ 5. SHARE    One tap → WhatsApp-ready message for family group    │
├──────────────────────────────────────────────────────────────────┤
│ 6. KEEP LOOKING  Re-checks every 30 min, alerts when found       │
├──────────────────────────────────────────────────────────────────┤
│ 7. SIDE PANEL  Donation camps · Blood bank directory ·           │
│                Rare-group (Bombay) donor guide                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. TinyFish features: one clear job each

> Judges reward projects where **every API has a distinct job**. Each one below gets a visible moment in the demo.

| # | TinyFish feature | Its job in BloodLink | Demo moment | Cost |
|---|---|---|---|---|
| 1 | **Agent API (SSE)** + `output_schema` | Operates the eRaktKosh form, shows all rows, returns typed JSON | Main search | ~$0.25–0.40/run |
| 2 | **Live Browser Preview** (`streaming_url`) | Iframe of the agent working on the government site | Audience watches the agent | included |
| 3 | **Batch runs** (`run-batch`) | Widened search: 5 districts × 2 components in parallel | Grid of live agents | ~$2 per widen |
| 4 | **Webhooks** (`webhook_url`) | "Keep looking" re-checks send results to our endpoint | Alert: *"O− found at Rotary, 1 unit"* | included |
| 5 | **Monitor (Topic)** | Watches *"blood donation camp Bengaluru"* daily, with a stated purpose | "Camps near you" feed | $0.005/run |
| 6 | **Search API** | Urgent blood drive news, hospital blood-bank pages | Supporting links | **Free** |
| 7 | **Fetch API** | Reads hospital blood-bank pages (24×7? apheresis?) | Extra info on each card | **Free** |
| 8 | **Datasets (TinySet)** | Prebuilt *"Blood banks in Bengaluru: phone, 24×7, apheresis, website"* | Directory tab | **Free (beta)** |
| 9 | **Research API** | Cited guide: *"How to find Bombay blood group donors in India"* | Opens when Oh± is selected | 2 free/day |
| 10 | **MCP (Claude)** | *"Find O− blood near Whitefield"* typed into Claude, which runs TinyFish | 20-sec closing clip | Agent rate |

---

## 4. Architecture

```
                         ┌──────────────────────────┐
   Browser (Next.js) ───▶│  Next.js API routes      │──▶ TinyFish (API key server-side only)
   • Search form         │                          │
   • Live iframe ◀───────│  /api/search   ─────────▶│──▶ Agent run-sse  ──▶ eRaktKosh
   • Result cards        │  /api/expand   ─────────▶│──▶ Agent run-batch (districts × components)
   • Share / Alerts      │  /api/watch    ─────────▶│──▶ Agent run-async + webhook_url
   • Side panel          │  /api/hook     ◀─────────│◀── webhook callbacks
                         │  /api/camps    ─────────▶│──▶ Monitor (topic) results
                         │  /api/enrich   ─────────▶│──▶ Search + Fetch (free)
                         │  Cache (JSON/SQLite, 10m)│
                         │  Spend cap + cost meter  │
                         └──────────────────────────┘
   Pre-built before demo: Datasets directory · Research guide (Bombay group)
```

**Stack:** Next.js (App Router) + TypeScript + Tailwind · `@tiny-fish/sdk` · SQLite/JSON cache · deployed on Vercel (or shared via `tinyfi.sh`).

---

## 5. The core agent call

### Target
`https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt`

### Form values (verified)

| Field | Element id | Example values |
|---|---|---|
| State | `stateCode` | `29` Karnataka |
| District | `distList` | `572` Bangalore Urban, `583` Bangalore Rural, `584` Ramanagara, `581` Kolar, `571` Tumkur, `582` Chikkaballapura |
| Blood group | `bgType` | `16` O−Ve, `15` O+Ve, `12` A−Ve, `11` A+Ve, `14` B−Ve, `13` B+Ve, `18` AB−Ve, `17` AB+Ve, `23` Oh−VE, `22` Oh+VE, `all` |
| Component | `bcType` | `11` Whole Blood, `12` Packed RBC, `28` SAGM Packed RBC, `14` Single Donor Platelet, `13` FFP, `19` Plasma … |

### Goal (draft)

```text
On this eRaktKosh Blood Stock Availability page:
1. Select State "Karnataka", District "Bangalore Urban",
   Blood Group "O-Ve", Blood Component "Whole Blood". Click Search.
2. Wait for the results table. Set "Show entries" to the largest option
   so all rows are visible (do not click through pages one by one).
3. For EVERY row extract: bank_name, address, phone, category,
   availability_text (copy exactly), last_updated.
Do not click any login links. Do not open other pages.
If the site shows an error or no table appears, return
{"status":"failure","reason":"<what you saw>"}.
```

### `output_schema`

```json
{
  "type": "object",
  "properties": {
    "status": { "type": "string" },
    "banks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "bank_name":         { "type": "string" },
          "address":           { "type": "string" },
          "phone":             { "type": "string" },
          "category":          { "type": "string" },
          "availability_text": { "type": "string" },
          "last_updated":      { "type": "string" }
        },
        "required": ["bank_name", "availability_text"]
      }
    }
  },
  "required": ["status", "banks"]
}
```

### Parsing availability (our code, not the agent)

The site uses **two formats**, so we handle both:

| Raw text | Parsed |
|---|---|
| `Available, O+Ve:18, AB+Ve:3, O-Ve:1` | `{ "O+": 18, "AB+": 3, "O-": 1 }` |
| `Available, O +ve, B +ve, O -ve` | `{ "O+": null, "B+": null, "O-": null }` (in stock, count not given) |
| `Whole BloodNot Available Search for another Component` | `{}`, not available |

### Ranking
1. Has the requested group → 2. More units → 3. Fresher `last_updated` → 4. Govt / Red Cross first when it's a tie.

---

## 6. Cost plan (wallet: $8)

| Action | Est. cost |
|---|---|
| One search (15–25 steps × $0.016) | ~$0.25–0.40 |
| Widened search (≈7 runs) | ~$2.00, only fires when the first search finds nothing |
| Search / Fetch | **Free** |
| Datasets (beta) | **Free** (3 runs / 24 h) |
| Research | **2 free / day** |
| Monitor | $0.005 / run |

**How we save credits:**
- Build everything against **mock data first** (zero credits).
- **10-minute cache** per query.
- Hard **spend cap** per session.
- Rehearse the demo from cached runs.
- Earn **+$5** from the dashboard's "Get Started" tasks.
- Show the **cost meter** on screen. Past winners were praised for spend controls.

---

## 7. Build phases (6 hours)

| Phase | Time | Goal | Credits? |
|---|---|---|---|
| **P0 · Scaffold** | 0:00–0:45 | Next.js app, UI shell, mock JSON from the real site, parser + ranking, result cards | ❌ none |
| **P1 · Free APIs** | 0:45–1:30 | Search + Fetch enrichment, Datasets + Research started in the background | ❌ free |
| **P2 · Core agent** | 1:30–2:45 | `/api/search` → Agent SSE, live iframe, schema, real results replace mock | ✅ ~$1–2 |
| **P3 · Agent power** | 2:45–4:00 | Widened batch search, "Keep looking" via webhook, Monitor camps feed | ✅ ~$2–3 |
| **P4 · Product polish** | 4:00–5:00 | WhatsApp share, freshness badges, empty/failed states, cost meter, disclaimers, Claude MCP clip | ❌ |
| **P5 · Demo-proof** | 5:00–6:00 | Cache golden runs, record backup video, rehearse 3-min pitch | ❌ |

---

## 8. Risks and fallbacks

| Risk | Fallback |
|---|---|
| eRaktKosh slow or down during demo | Serve cached results with a "last fetched" time, plus a backup video |
| Agent reports `COMPLETED` but finds nothing | Validate the result and show an honest empty state with directory phone numbers |
| Wallet runs low | Cache, spend cap, mock mode toggle, setup-task credits |
| Medical safety | **No medical advice.** Component substitutes and compatible groups are labelled *"doctor decides"*. Every card says *"Call to confirm before travelling."* |

---

## 9. Three-minute pitch

| Time | Beat |
|---|---|
| **0:00–0:30** | *"Last night, 84 of Bangalore's 94 blood banks had no whole blood. One hadn't updated its stock since March. Families find this out one phone call at a time."* |
| **0:30–2:30** | **Live demo:** O− search → agent working live → results empty → widened search with a grid of parallel agents → match found → WhatsApp share → "Keep looking" alert → camps + Bombay-group guide → same request in Claude via MCP |
| **2:30–3:00** | *"Government data. No API. Anti-scraping tokens. Only an agent that uses the web like a human can unlock it. That's TinyFish."* |

---

## 10. Team split

| Person | Owns |
|---|---|
| **A · Agent backend** | `/api/search`, `/api/expand`, `/api/watch`, `/api/hook`, cache, spend cap |
| **B · Frontend** | Form, live iframe, result cards, widened grid, share, states |
| **C · Platform + pitch** | Monitor, Datasets, Research, Search/Fetch enrichment, MCP clip, slides, backup video |

---

*Data points above were observed live on eRaktKosh on 31 Oct 2026 and will change over time. Re-check them before presenting.*
