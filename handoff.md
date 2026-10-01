# Handoff

Last updated: Thu 1 Oct 2026, 5:20pm. **Submission deadline is 7:00pm** ([form](https://qrco.de/dealoomAPI)). The top 10 demos start at 7:30pm (3 minutes each).

## PIVOT (6pm): Angel Doors

Now building **Angel Doors** (see README.md): dictated chat → strategic angels ranked by career (FAANG, enterprise, unicorn, advisor seats, customer-industry doors) → warm intro paths → drafted intro asks. Files: `lib/angels.mjs`, `lib/parse.mjs` (gpt-6-luna + rules fallback), `public/angels.html` (served at `/`). Cached: UK Health, Fintech, Enterprise Software.

## Previous build: Cross the Pond

US investors who actually back UK/EU startups like yours, with deal evidence, a "Says vs Does" thesis check and UK bridge investors. Product, live numbers and demo script: **`docs/product.md`**. API shapes: `docs/api-contract.md`.

**Run it:** `node server.mjs`, then open [http://localhost:3000](http://localhost:3000). Saved-data mode: [http://localhost:3000/?mock=1](http://localhost:3000/?mock=1).

## Status

| Part | Status | Files |
|---|---|---|
| Dealroom client | Done | `dealroom.mjs` (token cache, 401 refresh, 429 back-off; importable `get()`) |
| Data pipeline | Done | `lib/pipeline.mjs`: rounds → investors → HQ → score, bridges, benchmark, graph; file cache in `cache/match/` (6h TTL, also used as a fallback if the API fails) |
| Server | Done | `server.mjs`: `/api/options`, `/api/search`, `/api/match` (`vc_only`, `company`, `fresh`), `/api/thesis`, static `public/` |
| Frontend | Done, verified live in headless Chrome at 5:17pm | `public/index.html`, `app.js`, `styles.css`, `public/mock/*.json` (saved-data fallback) |
| "VCs only" toggle | Done | Frontend checkbox → `vc_only=1` on match and thesis |
| Says vs Does scraper | Done and integrated at 5:25pm | `lib/thesis.mjs` (keyword mode; LLM mode if a key is added to `.env`), `scratch/test-thesis.mjs`; cache in `cache/thesis/`. Pre-warmed for the top 12 investors in UK Health Pre-Seed/Seed (all + VCs only). Sites that can't be scraped (Ascension 403; OMX and Plug and Play are JS-only) fall back to the Dealroom `about` text. **Demo moment:** Zetta's website says Enterprise Software / Pre-Seed, but it has done 2 UK Health Seed deals → "mismatch" |
| Pre-cached demo cohorts | 7 done | UK Health/Fintech/Enterprise Software/Energy at Pre-Seed+Seed, UK Health/Fintech at Seed+Series A, and Europe Health at Pre-Seed+Seed. Both all-investors and VCs-only are instant |

## Next steps

1. Pre-warm the thesis cache for any other cohort you plan to demo: loop `/api/thesis` over the top investor UUIDs from `/api/match`.
2. Run the full demo flow in a browser: search "Droplet Scientific", hover the graph, open an investor, toggle VCs only.
3. Optional polish: company labels on graph hover, an outreach memo (needs an LLM key in `.env`: `XAI_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`).
4. Rehearse the 3-minute script in `docs/product.md`.
5. **Submit by 7:00pm** at [qrco.de/dealoomAPI](https://qrco.de/dealoomAPI).

## Data gotchas (found live)

- The API's real row fields differ from the setup guide: `locations[role=hq].country.name`, `launch_date` (`YYYY-MM`), `valuation.value`. Images have no scheme, so prefix `https://`.
- `/data/investors` with `portfolio_count_location` over large populations, or the default `view=full` on big lists, returns a **500 after about 15s**. Use `view=summary` and start from rounds.
- `investor_type` takes codes (`venture_capital`), not IDs or display names. Send `investor_experience_id:industry` as plain `investor_experience_id`.
- Investor `stages` is 0% filled and `deal_size` is unreliable, so the thesis comes from actual deals plus a website scrape.
- Geocoding errors: Kidney Research UK is recorded in Cambridge, MA (auto-excluded and listed in caveats). Rounds in UK enterprise software may be linked to the wrong "Connect Ventures" entity (LA instead of London).
- Uncached cohorts take 5–30s (Europe is about 22s). Pre-warm anything you plan to demo.
- `page.tier` says `"free"`, but data is not redacted. Python SSL is broken on this Mac (use Node/curl). MCP runs on the legacy API.

## Where things are

- Event facts, slide transcription, all links: `docs/hackathon.md` (photo: `docs/slide.jpg`)
- Feasibility research (ideas A–D, including the VC-side stealth sourcing): `docs/feasibility.md`
- Analyst correctness rules: `dealroom-api-analysis.md`
- Offline API docs: `docs/reference/`; cookbooks: `docs/cookbooks/`
- Probe scripts: `scratch/`

## Resume in a new chat

> Read AGENTS.md and handoff.md in this folder and continue from there.
