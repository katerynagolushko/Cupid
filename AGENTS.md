# AGENTS.md

Instructions for any AI coding agent (Cursor, Claude Code, Codex) working in this folder. Read this file and `handoff.md` before doing anything.

## Context

This is our entry for the **Dealroom API Hackathon**, Thursday 1 Oct 2026 at Phoenix Court, London. The **submission deadline is 7:00pm**, then the top 10 teams give 3-minute live demos. Full event facts are in `docs/hackathon.md`.

Judges pick demos on three questions. Optimise for all three:

1. **Does it work, live?** Reliability beats features.
2. **Does it use the graph?** Show relationships (company, founder, investor, fund, university, people), not just rows.
3. **Does it replace a workflow and save serious time, and for whom?** Name the user.

## Key event info (from the on-site slide)

| Item | Value |
|---|---|
| Wifi | `PhoenixCourt` / `BRILLplace` |
| Agenda | 4:30pm start · **7:00pm submit** · 7:30pm top 10 demos (3 min) · 8:00pm winners |
| Submit | [qrco.de/dealoomAPI](https://qrco.de/dealoomAPI) (Google Form) |
| API quickstart | [developers.beta.dealroom.co/getting-started/quickstart](https://developers.beta.dealroom.co/getting-started/quickstart) |
| Cookbooks | [dealroom.co/cookbooks](https://dealroom.co/cookbooks) (offline in `docs/cookbooks/`) |
| Key help | [peter.foy@dealroom.co](mailto:peter.foy@dealroom.co) |

The full slide transcription and every link are in `docs/hackathon.md`, and the photo is at `docs/slide.jpg`.

## What we're building

**Cross the Pond**: for UK/EU founders raising who want US investors. It shows the US investors who actually back companies like theirs (real Dealroom rounds as evidence), "Says vs Does" (website thesis vs actual deals), UK bridge investors who co-invest with US funds (warm intro path) and a round-size benchmark. Full product, live numbers and demo script: `docs/product.md`. API shapes: `docs/api-contract.md`.

Run: `node server.mjs` → [http://localhost:3000](http://localhost:3000) (`?mock=1` = saved data). The server must be started from the repo root, because it reads `.env` from the cwd.

## Repository map

| Path | What |
|---|---|
| `server.mjs` | HTTP server (no deps): `/api/options`, `/api/search`, `/api/match`, `/api/thesis` + static `public/` |
| `lib/pipeline.mjs` | Core graph walk: rounds → investors → HQ → score, bridges, benchmark, graph. File cache `cache/match/` (6h TTL, also used as a fallback on API failure) |
| `lib/thesis.mjs` | Website thesis scraper + `compareThesis` ("Says vs Does"). Cache `cache/thesis/` |
| `public/` | Frontend (vanilla JS, SVG force graph). `public/mock/*.json` are saved-data fixtures used on `?mock=1` or API failure |
| `cache/` | Cached Dealroom-derived results for the live demo. Gitignored (Dealroom terms: no redistribution) |
| `scratch/` | Feasibility probes and test scripts |
| `docs/product.md` | Product, scoring, live numbers, demo script, backlog |
| `docs/api-contract.md` | Frontend ↔ server JSON contract |
| `docs/feasibility.md` | What data Dealroom has for each idea (A–D), probed live |
| `docs/briefs/` | Sub-agent briefs (frontend, thesis) |
| `dealroom.mjs` | Working API client: token caching, 401 refresh, 429 back-off. `node dealroom.mjs` runs the verification query; `node dealroom.mjs "<GET path>"` prints raw JSON; `import { get } from "./dealroom.mjs"` from code |
| `.env` | Credentials (`DEALROOM_CLIENT_ID`, `DEALROOM_CLIENT_SECRET`). **Secret, gitignored** |
| `.dealroom-token.json` | Cached bearer token (24h). Gitignored |
| `dealroom-api-analysis.md` | Dealroom analysts' correctness rules. **Mandatory** before any count, ranking, chart or total |
| `SETUP.txt` | Original setup instructions from the zip. Gitignored |
| `docs/hackathon.md` | Event facts, agenda, judging, submission link, terms |
| `docs/reference/` | Offline Dealroom docs: `llms.txt` index, `openapi.yaml`, filtering, pagination, aggregates, limits, MCP, examples |
| `docs/cookbooks/` | The five official cookbook apps, with their build prompts |
| `handoff.md` | Current state and next steps. Update it as you work |

## Hard rules

- **Never print, log, echo or commit the client secret.** Read credentials from `.env` only. Never ask the user to paste the secret. Keep credentials server-side and never put them in browser code.
- **Do not rewrite `.env`.** If it must be copied, copy it byte for byte.
- **Terms:** hackathon use only, stay within the rate limit, and no bulk export or scraping. Cache responses for the demo, but do not mirror the dataset.
- **Discover, do not guess.** Before inventing a field, filter key or endpoint, check `docs/reference/openapi.yaml`, `docs/reference/llms.txt` or `GET /reference/filters?scope=<scope>`.
- **Apply `dealroom-api-analysis.md`** to every analysis: default filters by query type, HQ vs founding attribution, which "Europe", tag-family decoding, and the review checklist in its section 5.

## API facts verified live (1 Oct 2026)

| Fact | Detail |
|---|---|
| Base URL | `https://api.beta.dealroom.app` |
| Auth | `POST https://accounts.dealroom.co/oauth/token`, JSON body with `client_id`, `client_secret`, `audience: https://api.beta.dealroom.app`, `grant_type: client_credentials`. The token lasts 24h; cache it |
| Required headers | `Authorization: Bearer <token>`, `X-Client-Id: <client id>`, and an explicit `User-Agent`, because Cloudflare blocks some defaults. A missing `X-Client-Id` returns 400, not 401 |
| Rate limit | About 5 req/s. On a 429, honour `Retry-After` |
| Versioning | Optional `API-Version: YYYY-MM-DD` header. The analysis file's filter names match version `2026-10-02` |
| Record IDs | Entities are keyed by `uuid`. `id` exists only as a filter key. Single-record endpoints take UUIDs, not numeric IDs |
| Pagination | The response has `page.next_cursor`; the request param is `cursor`, **not** `next_cursor`, which silently returns page 1 forever. `include_total=true` fills `page.total` |
| Company row shape | `name`, `uuid`, `launch_date` (`"YYYY-MM"`), `valuation: {value, year, month}`, `funding: {total, total_vc, rounds_count}`, `locations[]` with `role` = `hq` / `founding` / `office` and nested `country.name`, `classifications[]`, `taxonomy`, `founders`, `employees_count`, `signal_rating`. **The docs' `hq_country`, `launch_year` and `latest_valuation` are not on the row** |
| Tier | `page.tier` reports `"free"` for this key, but there is no `locked` array and fields are populated. If you see `locked` or a field that is unexpectedly null, suspect redaction before reporting "no data" |
| Filter syntax | `filter=and(classification[in_any]:vc_backed,launch_date[gte]:2020)`. Repeating a key means AND; piping values (`a\|b`) means OR. An unknown key returns `400 UNKNOWN_FILTER` |
| Filter registry | `GET /reference/filters?scope=companies` lists 42 company filters, including `hq_location`, `founding_or_hq_location`, `growth_stage`, `classification`, `taxonomy_id:<family>`, `signal_*`, `founder.*` and `founder__university.id`. Look up values with `/reference/filters/<key>/values` |
| Tag IDs | Everything is `taxonomy_id`; the last two digits give the family (`01` sector, `02` technology, `03` industry, `04` sub-industry, `08` business model). Decode every ID before sending it |
| MCP | `https://mcp.dealroom.co/mcp` uses the **legacy** API. Use REST for the build |

### More gotchas found while building

- Large `/data/investors` queries (with `portfolio_count_location`, or the default `view=full`) return a **500 after about 15s**. Use `view=summary` and start from `/data/transactions`.
- Round rows carry `investors[]` (`is_lead`, `investor.uuid`/`name`) but **not** the investor's HQ. Batch-lookup with `id[in_any]:uuid|uuid…` (50 per call).
- Enum filters take **codes**: `investor_type[in_any]:venture_capital`, `founder.classification[in_any]:serial_founder`. `standardized_round` takes names such as `Pre-Seed|Seed`.
- Registry keys like `investor_experience_id:industry` are sent as plain `investor_experience_id`.
- `taxonomy_id/values?type=industry` lists all 31 industries. Region IDs: UK 93, Europe (region) 76, Europe (continent) 34, Europe incl. Israel 16, EU+UK 416, US 233.
- Images come without a scheme, so prefix `https://`.
- Known data errors: Kidney Research UK is recorded as US-HQ (Cambridge, MA), and there are two "Connect Ventures" entities (LA vs London).

### Graph endpoints (the judging differentiator)

`/data/companies/{id}/funding-rounds`, `/investors`, `/team`, `/similar`, `/valuations`, `/headcount`, `/web-traffic`; `/data/investors/{id}/portfolio`, `/funds`, `/similar`, `/team`; `/data/founders/{id}/companies`; `/data/people/{id}/career`, `/education`; `/data/universities/{id}/alumni`; `/data/funds`; `/data/jobs`; `/data/news`; `/data/search`. Aggregates and timeseries are under `/analytics/...` (see `docs/reference/aggregates.md`). Confirm exact paths in `openapi.yaml`.

## Machine notes

- macOS with zsh. Node is at `/opt/homebrew/bin/node`, and `jq` is available.
- **Python's `urllib` fails SSL verification on this machine** (python.org install without certificates). Use Node `fetch` or `curl`. With curl, pass `-g` for URLs containing `[ ]`.
- There is no framework and there are no dependencies: a single Node server plus static HTML. Credentials stay server-side, and cached results plus `public/mock/` keep the demo alive if the network dies.
- To restart the server: `lsof -ti tcp:3000 | xargs kill`, then `node server.mjs`. Background processes started inside an agent shell call can die when the call ends, so run the server as a dedicated long-running process.
- Headless check: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=/tmp/x.png --window-size=1440,1700 --virtual-time-budget=15000 http://localhost:3000/`

## Working agreements

- Demo reliability first: precompute or cache the demo path, and have a saved-data fallback.
- Every number shown on stage must survive the checklist in `dealroom-api-analysis.md` section 5. State filters, attribution and which "Europe" in the UI.
- Show sources and retrieval dates, and label missing or partial data rather than hiding it.
- Update `handoff.md` after every meaningful step.
- UK spelling in docs.
