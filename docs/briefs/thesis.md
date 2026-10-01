# Brief: the "Says vs Does" thesis module

Repo: `/Users/mtk/Documents/Development/GenAI/dealroomhack` (macOS, Node 23, **standard library only**: no npm, no `package.json`). Deadline: about 6:00pm UK time (it is about 5:05pm). It must be reliable for a live demo.

**First, read** `AGENTS.md` and the `/api/thesis` section of `docs/api-contract.md`. Your module produces the `stated` and `verdict` objects; the server builds `revealed`.

## Context

"Cross the Pond" helps UK/EU founders find US investors who actually back companies like theirs. The Dealroom API gives *revealed* behaviour (real rounds). Dealroom's stated investor fields are poor (`stages` is 0% filled), so we scrape each investor's own website for their **stated** thesis and compare "Says vs Does".

## Build only

`lib/thesis.mjs` and the test script `scratch/test-thesis.mjs`. Do not edit any other file. **Never read, print or log the values in `.env`.**

## `lib/thesis.mjs` exports

### 1. `async fetchStatedThesis({ name, domain, about })`

Returns `{ source_urls, fetched_at, method: 'keyword'|'llm'|'unavailable', stages, sectors, geographies, cheque: {min,max}|null, quotes }`.

**Fetching**
- Fetch `https://<domain>/`, plus up to 4 likely thesis pages found in the homepage's links (same host, fetched in parallel). Match links whose href or text contains about, approach, thesis, focus, what-we-do, invest, strategy, portfolio or apply.
- Use the global `fetch` with an explicit `User-Agent` (for example `Mozilla/5.0 (compatible; CrossThePond/1.0)`) and follow redirects. Time out each request at 6s with `AbortSignal.timeout`, with a total budget of about 12s.
- Strip scripts, styles and tags; decode common entities; collapse whitespace.
- Also use Dealroom's `about` text as a source, recorded as `dealroom:about` in `source_urls`.

**Keyword extraction** (the default; deterministic)
- **Stages**, from the canonical list `['Pre-Seed','Seed','Series A','Series B','Series C+','Growth']`. Accept variants such as pre-seed, preseed and pre seed. Map only explicit terms; "early stage" adds `Seed` only if nothing else matched.
- **Sectors**, mapped to Dealroom industry names:
  - Health: healthcare, healthtech, medtech, biotech, life sciences, digital health, therapeutics
  - Fintech
  - Enterprise Software: SaaS, B2B software, devtools, AI infrastructure
  - Energy: climate, cleantech
  - Food, Education (edtech), Security (cybersecurity), Robotics, Space, Semiconductors, Transportation (mobility), Real Estate (proptech), Media, Gaming, Legal, Marketing, Jobs Recruitment and Telecom
- **Geographies**, from `['US','UK','Europe','Global','Israel','Asia','LatAm','Africa']`:
  - United States / North America → US
  - Europe / European → Europe
  - London / United Kingdom / UK (word-bounded) → UK
  - global / worldwide / anywhere → Global
- **Cheque size**:
  - Match $/£/€ amounts with k or m/million that appear within about 80 characters of cheque, check, invest, ticket, initial or first.
  - Return min/max in USD, using GBP 1.27 and EUR 1.08.
  - Exclude fund sizes (amounts near fund, AUM, under management or raised) and anything over $50M.
- **Quotes**: up to 3 sentences under 220 characters that contain a stage, sector or geography keyword together with invest, back, partner or fund. Prefer website text over the Dealroom text.

**Optional LLM mode**
- Trigger it if `XAI_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set in `process.env`. Also parse `.env` in `process.cwd()` for **only those three names**, without logging anything.
- Send the cleaned text, truncated to about 12k characters, and ask for strict JSON in the same shape.
- Providers:
  - xAI: `POST https://api.x.ai/v1/chat/completions` with `grok-3-mini` (OpenAI-compatible).
  - OpenAI: `/v1/chat/completions` with `gpt-4o-mini` and `response_format: json_object`.
  - Anthropic: `/v1/messages` with `claude-3-5-haiku-latest`, plus the `x-api-key` and `anthropic-version: 2023-06-01` headers.
- Normalise the output to the canonical vocabulary above. On any failure, or a 10s timeout, fall back to keyword mode.
- **No keys are set right now, so keyword mode is what will run. Make it excellent.**

**Failure and caching**
- If the site can't be fetched and `about` is empty, return `method: 'unavailable'` with empty arrays. **Never throw.**
- Cache in memory by domain, and write through to `cache/thesis/<domain>.json` (create the directory). Read that file first if it's under 24h old, so the demo works offline.

### 2. `compareThesis(stated, revealed, query)`

- `revealed` = `{ stages: {'Seed': 4, 'Pre-Seed': 2}, industry_deals, region_deals, leads, last_deal: 'YYYY-MM'|null }`
- `query` = `{ industryName: 'Health', stages: ['Pre-Seed','Seed'], regionName: 'United Kingdom' }`
- Return `{ stage, sector, geography, summary }`, each field one of `'match'|'mismatch'|'unknown'`.

| Field | unknown | match | mismatch |
|---|---|---|---|
| stage | `stated.stages` is empty | any revealed stage with count > 0 is in `stated.stages` (handle Series C+/Growth sensibly) | otherwise |
| sector | `stated.sectors` is empty | `query.industryName` is in `stated.sectors` | otherwise |
| geography | stated geographies are empty | stated includes `Global`; or `UK` and the region is United Kingdom; or `Europe` and the region contains Europe/EU or is the UK | **stated is US-only**: this is the key insight |

`summary` is one plain-English sentence that highlights any contradiction. For example:
- "Says it backs pre-seed and seed health founders globally; has done 6 United Kingdom Health deals at Pre-Seed/Seed since 2024 (led 1). Consistent."
- "Website says US-focused, but has joined 3 United Kingdom Health rounds, so it is open to UK founders in practice."

## `scratch/test-thesis.mjs`

Run `fetchStatedThesis` in parallel on: techstars.com, ycombinator.com, sosv.com, ascensionventures.org, zettavp.com, ldv.co, omxventures.com, plugandplaytechcenter.com and seedcamp.com. Print a compact table and one `compareThesis` example for each.

Iterate on the regexes until the results look sensible:
- YC → Pre-Seed/Seed, Global/US
- Ascension → Health
- Zetta → Enterprise Software/AI

Report the sites that failed (bot walls or JS-only SPAs); the Dealroom `about` text covers those. Python urllib SSL is broken on this machine, so use Node.

## Return

A short summary: the exported signatures, the test table output, known weak spots, and integration notes (call signature, latency, cache location).
