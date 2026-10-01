# Cross the Pond: product, live numbers and demo script

## One-liner

**Which US investors actually back companies like yours, according to real Dealroom rounds, and which UK funds can walk you in.**

## Who it's for and the workflow it replaces

| | |
|---|---|
| User | A UK/European founder raising pre-seed to Series A who is considering US investors (raising in the UK is hard, and many founders end up pitching the US) |
| Today's workflow | Days of manual research: Crunchbase/LinkedIn searches, reading fund websites, guessing whether a US fund will even take a UK company, cold emailing |
| With Cross the Pond | Seconds. Pick industry, stage and HQ, and get a ranked list of US investors who **have already done** deals like yours, the deals themselves as evidence, what each fund says vs what it does, and the UK co-investors who are the warm route in |
| Judging fit | **Works live** (cached cohorts, saved-data fallback) · **Uses the graph** (company ↔ round ↔ investor ↔ investor HQ ↔ co-investor) · **Replaces a workflow** (founder investor research) |

## How it works

1. **Cohort.** `/data/transactions`: VC rounds (`is_vc_round`, with Mature and Outside Tech excluded, which are the Dealroom analyst defaults) for companies HQ'd in the region, in the chosen industry, at the chosen standardised stages, since a given year.
2. **Graph walk.** Every investor on those rounds, then a batch lookup of each investor's HQ (`/data/investors?filter=id[in_any]:…&view=summary`).
3. **US investors.** HQ = United States, excluding government, university and service-provider investors, and excluding investors whose domain or name looks European (catches geocoding errors).
4. **Score (0–100).** Segment deals (40, square-root scaled) + leads (15) + recency (20) + stage fit against `preferred_round` (25). There is an optional "VCs only" toggle that drops accelerators.
5. **Bridges.** Non-US investors who co-invested with US investors in the cohort, ranked by shared deals: the warm-intro path.
6. **Says vs Does.** Scrape the investor's website for its stated stages, sectors, geographies and cheque size, and compare that with its actual cohort deals (`lib/thesis.mjs`).
7. **Benchmark.** Median, p25 and p75 round size and median valuation for the cohort.

## Live numbers (verified 1 Oct 2026, around 5:15pm)

Default demo cohort: **UK · Health · Pre-Seed + Seed · since 2024**

| Metric | Value |
|---|---|
| VC rounds | **734** |
| Distinct investors on them | **629** |
| US-HQ investors | **108** (1 excluded as a geocoding error: Kidney Research UK, recorded in Cambridge MA) |
| Rounds with ≥1 US investor | **105 (14%)** |
| Median round | **$1.0M** (n=662; middle half $348K–$2.4M) |
| Median valuation | **$5.5M** (n=648; may include Dealroom estimates) |
| Top US (all types) | Techstars (10 deals), Y Combinator (6, led 1), Plug and Play (7), SOSV (6), Long Journey (2, led 1), Zetta (2, led 1), LDV (2, led 1) |
| Top US (VCs only) | Plug and Play, SOSV, Long Journey Ventures |
| Top UK bridges | Empirical Ventures (6 shared deals, led 2), SFC Capital (4), Entrepreneurs First (4), **LocalGlobe** (3, led 2: tonight's host), Amino Collective, Atomico |

Other cohorts, pre-cached in `cache/match/`:

| Cohort | Rounds | US investors | Top US VCs (VCs-only toggle) |
|---|---|---|---|
| Europe (region 76) Health Pre-Seed/Seed | 2,345 | 252 | Plug and Play, Long Journey, Electron Capital |
| UK Fintech Pre-Seed/Seed | 560 | 150 | Plug and Play, Ethereal Ventures, WAGMI Ventures |
| UK Enterprise Software Pre-Seed/Seed | 691 | 223 | CIV, Connect Ventures*, Andreessen Horowitz |
| UK Health Seed/Series A | 721 | 159 | Cedars-Sinai Accelerator, Frazier Life Sciences, SOSV |
| UK Fintech Seed/Series A | 606 | 195 | Andreessen Horowitz, a16z crypto, General Catalyst |
| UK Energy Pre-Seed/Seed | 393 | 64 | Plug and Play, HL Energy Ventures, Lowercarbon Capital |

\* Dealroom links these rounds to the LA "Connect Ventures" entity, but there is also a London "Connect Ventures (Europe)", so the attribution may be wrong.

## 3-minute demo script (draft)

1. **(20s) Problem.** "Raising in the UK is hard, so founders go to the US. But which US funds actually write cheques into UK companies at your stage? Today that's days of Crunchbase and guesswork."
2. **(40s) Live query.** Type a UK health company (for example Droplet Scientific), which prefills Health, Pre-Seed/Seed and UK. Read the headline: 734 rounds, 108 US investors, only 14% of rounds had a US investor, median round $1M.
3. **(40s) Graph.** Hover Techstars or SOSV to trace their deals. Point at the bridges column: "Empirical, SFC and LocalGlobe (who are hosting us tonight) repeatedly bring US funds into UK health deals. That's your warm intro."
4. **(40s) Evidence.** Open an investor: real deals with dates, amounts, lead badges and source links. Then Says vs Does: "the website says X; in practice they've done N UK deals."
5. **(20s) Toggle VCs only.** Accelerators disappear and the VC list remains.
6. **(20s) Close.** "Built for UK founders, replacing days of research, and every number is traceable to a Dealroom round. Next: the VC-side mirror, stealth-founder sourcing (762 UK stealth companies since 2025 with linked founders)."

## Backlog / next ideas

- **VC-side early sourcing** (see `docs/feasibility.md`, Idea D): stealth companies → founder → ex-employer/education/founder label. For example, 119 ex-DeepMind founders with companies launched 2025+, or 2,283 UK companies since 2024 with serial or super founders.
- An outreach memo per investor (needs an LLM key in `.env`).
- Fund vehicles (`/data/investors/{id}/funds`) to show which fund is currently deploying.
