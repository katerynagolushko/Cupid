# Feasibility: does Dealroom have the data? (probed live, 1 Oct 2026, ~4:45pm)

Probe scripts: `scratch/us-investors-in-uk.mjs`, `scratch/thesis-coverage.mjs`.

## Idea A: which US investors actually back UK / European startups

**Yes, strongly supported.** This is a graph traversal: rounds, then investors, then investor HQ.

| Step | Call | Result |
|---|---|---|
| UK health pre-seed/seed VC rounds since 2024 | `/data/transactions?filter=and(hq_location[in_any]:93,taxonomy_id[in_any]:125403,standardized_round[in_any]:Seed\|Pre-Seed,year[gte]:2024,is_vc_round[eq]:true)` | **734 rounds**, paged in about 5s |
| Investors on those rounds | `investors[]` on each round, with `is_lead` and the investor `uuid` | **629 distinct investors** |
| Keep the US-HQ ones | `/data/investors?filter=and(id[in_any]:<uuids>,hq_location[in_any]:233)&view=summary` in batches of 50 | **109 US-HQ investors** |

The top US backers of UK health pre/seed are Techstars (10), Plug and Play (7), Y Combinator (6), SOSV (6), Ascension Ventures (3), Long Journey, Zetta, LDV, OMX and others.

Gotchas:
- The investor's HQ is not on the round row, so a second lookup by `id[in_any]` is needed.
- `portfolio_count_location` on `/data/investors` over all US VCs **times out with a 500 after 15s**. Start from rounds, not investors.
- The default `view=full` on large investor lists also times out, so **use `view=summary`**.
- Some HQ data looks odd (for example "Kidney Research UK" showing as US-HQ, and angels such as "Jonathan Milner" in the list). Filter by investor type and show the evidence.

## Idea B: thesis matching (for example, a healthtech pre-seed VC for a healthtech pre-seed founder)

**Supported, but use what investors actually do, not what they state.**

Field coverage across a sample of 100 US health-experienced VCs active since 2025 (2,577 in total):

| Field | Coverage | Usable? |
|---|---|---|
| `investments.preferred_round` | 100% | Yes, though coarse (a16z shows "SEED") |
| `investments.last_round_date` | 100% | Yes, as an "is this investor still active" signal |
| `domain` (website) | 99% | Yes: **scrape the website for the stated thesis** (extra API) |
| `deal_size` min/max | 68% | Treat with caution (a16z shows $30–75M) |
| `about` text | 51% | Partial |
| `stages` | **0%** | No |

Filters available on `/data/investors`: `hq_location`, `investor_type` (takes the code, for example `venture_capital`, **not** the ID or display name), `investor_experience_id` (a taxonomy ID; the `:industry` suffix in the registry is a label, not part of the key), `investor_stage_id`, `preferred_round`, `min_deal_size`/`max_deal_size`, `last_investor_round_date`, `portfolio_company_id`, `lp_investor_id`.

**Revealed thesis** = the stage, sector, geography, lead vs follow and recency of each investor's actual rounds. Get this from `/data/transactions` (shown above) or `/data/investors/{id}/portfolio`, which returns `is_lead`, `rounds_count`, `last_round_date` and the full `company`.
**Stated thesis** = scrape the investor's website with an LLM. Then show where the two agree and where they differ: "says it backs pre-seed healthtech; has actually done 3 such UK deals in 2 years."

## Idea C: help with the raise paperwork

**Dealroom only covers part of this.**

| Available | Not available |
|---|---|
| Round amount (92% of UK health seed rounds sampled), valuation (88%, which may include estimates), `round_type` vs `standardized_round`, `is_verified`, lead investor, date, `source_url` | Term sheets, cap tables, shareholder %, legal docs, exit terms (see `docs/reference/known-limitations.md`) |

Dealroom works for **benchmarking**: "UK healthtech seed median is about $1.6M (n=46)", comparable rounds and valuations, and who led them. The document generation itself (investor memo, outreach, data-room checklist, SEIS/EIS or US-readiness notes) would need an LLM and other sources. Legal content must be cited and presented as a checklist, not advice.

## Idea D: a VC-side tool for finding super-early startups (probed live about 5:15pm)

**Strong data.** The key is that Dealroom tracks **people and stealth companies**, not just funded companies.

| Signal | Filter / endpoint | Live result (UK) |
|---|---|---|
| Stealth companies | `name[eq]:Stealth` on `/data/companies` (rows are literally named "Stealth Startup"; `name` is a contains-match) | **762** UK stealth companies launched 2025+. Each has a linked founder (`founders.items[].person.uuid`) and `start_date` |
| Brand-new companies | `launch_date[gte]:2025`, `has_founder[eq]:true` | **5,743** UK companies since 2025 with a known founder |
| Founder quality | `founder.classification[in_any]:serial_founder\|super_founder` (also `promising_founder`, `strong_founder`) | **2,283** UK companies since 2024 with a serial or super founder (many in stealth) |
| "Ex-X founders" (talent flows from big companies) | `/data/people?filter=and(employer_id[eq]:<company uuid>,roles[in_any]:founder,last_founded_entity_launch_date[gte]:2025)` | **119** ex-Google DeepMind people who founded something in 2025+ |
| Spinouts | `classification[in_any]:spinout` | **246** UK spinouts since 2024 |
| University link | `founder__university.id`, plus `/data/universities/{id}/alumni` | Works (see the University Desk cookbook) |
| Founder background | People `taxonomy_id:background` (Technical, Medical, Physics…), `/data/people/{id}/career` and `/education` | Works |
| Unfunded | `funding.rounds_count = 0` on the row. Note that `total_funding[lte]:0` only matches explicit zeros (121); most unfunded companies have `null` | Filter client-side |
| Momentum | `signal_rating`, `signal_growth`, `signal_team`, `signal_timing`; `/web-traffic` and `/headcount` series; `/data/jobs`; `/data/news` | Often **null for brand-new or stealth** companies, so it's better for slightly older ones |
| Semantic search | `semantic_keyword` ranks by meaning ("AI for clinical trials") | Available |
| Patents | `has_patents`, `/patents` | Sparse titles |

**Flaky:** `is_hiring[eq]:true` combined with `launch_date` returned no total (it possibly timed out). Retry it with `view=summary`.

The best demo traversal is: stealth company → founder → career (ex-DeepMind / ex-Revolut) + education + founder label → score, and then "which investors back founders like this" (the reverse of the Cross the Pond graph).

## Graph angle (judging criterion 2)

- **Syndicate bridges:** UK lead investors who repeatedly co-invest with US funds. They are the warm path to US money ("pitch these UK leads first; they bring US funds in"). This is computable from the same round data.
- Further joins: company to founders (`/team`) to university (`/education`), and investor to `/similar` investors and `/funds`.
