# Product: "Cross the Pond" — API contract (frontend ↔ server)

**Who it's for:** a UK/European founder about to raise who wants US investors. Today they hand-build a spreadsheet from Crunchbase, LinkedIn and fund websites over days. This tool takes seconds, and every claim links to a real deal.

**What it answers:** "Which US investors *actually* back companies like mine (same industry, same stage, same region), and does their stated thesis match what they really do? Which UK/EU investors bring US money into deals (warm intro path)? What's a normal round size for me?"

Server: `node server.mjs` → `http://localhost:3000`. Static files are served from `public/`. All endpoints are `GET`, return JSON, and report errors as `{ "error": "message" }` with a 4xx/5xx status. Money is in USD (raw numbers, not formatted).

## `GET /api/options`

```json
{
  "industries": [{ "id": 125403, "name": "Health" }, { "id": 126403, "name": "Fintech" }],
  "stages": ["Pre-Seed", "Seed", "Series A", "Series B"],
  "regions": [{ "id": 93, "name": "United Kingdom" }, { "id": 416, "name": "European Union + UK" }],
  "defaults": { "industry": 125403, "stages": ["Pre-Seed", "Seed"], "region": 93, "since": 2024 }
}
```

## `GET /api/search?q=<text>`

Company autocomplete, so a founder can type their own company.

```json
{ "results": [{ "uuid": "…", "name": "Droplet Scientific", "tagline": "…", "hq_country": "United Kingdom", "image": "https://…|null",
                "industry": { "id": 125403, "name": "Health" } , "last_round": "Seed|null", "region_id": 93 }] }
```

The frontend uses a selected company to prefill industry, stage and region, then calls `/api/match`, passing `company=<uuid>` so it can be excluded from results and shown in the header.

## `GET /api/match?industry=125403&stages=Pre-Seed|Seed&region=93&since=2024[&company=<uuid>][&vc_only=1][&fresh=1]`

- `vc_only=1` keeps only investors typed "venture capital", dropping accelerators such as Techstars, YC and Plug and Play. The response echoes it as `query.vc_only`. **The frontend should show a "VCs only" toggle.**
- `fresh=1` bypasses the 6h server cache. Uncached cohorts take 5–30s; cached ones return instantly.
- `from_cache: true` means the response was served from `cache/match/`.

```json
{
  "query": { "industry": { "id": 125403, "name": "Health" }, "stages": ["Pre-Seed", "Seed"], "region": { "id": 93, "name": "United Kingdom" }, "since": 2024,
             "company": { "uuid": "…", "name": "…", "tagline": "…" } },
  "method": "Funding rounds (VC rounds only, is_vc_round) for companies HQ'd in <region>, industry <name>, standardised stage in <stages>, year ≥ <since>; investors on those rounds; filtered to investors HQ'd in the United States.",
  "retrieved_at": "2026-10-01T16:05:00Z",
  "from_cache": false,
  "stats": { "rounds": 734, "investors": 629, "us_investors": 109, "rounds_with_us_investor": 150, "us_share_of_rounds": 0.2 },
  "benchmark": { "n_amount": 680, "median_amount": 1584001, "p25_amount": 700000, "p75_amount": 3000000,
                 "n_valuation": 600, "median_valuation": 7900000 },
  "investors": [
    {
      "uuid": "…", "name": "Y Combinator", "dealroom_url": "https://app.dealroom.co/investors/…", "domain": "ycombinator.com", "image": "…|null",
      "types": ["accelerator"], "hq_city": "San Francisco",
      "score": 87,
      "score_breakdown": { "segment_deals": 40, "leads": 15, "recency": 20, "stage_fit": 12 },
      "segment_deals": 6, "leads": 1, "last_deal": "2026-08",
      "preferred_round": "SEED", "total_investments": 5000, "deal_size": { "min": 125000, "max": 500000 },
      "about": "…|null",
      "deals": [{ "company": { "uuid": "…", "name": "Fuse", "dealroom_url": "…" }, "date": "2026-08", "round": "Seed",
                  "amount": 2000000, "valuation": null, "is_lead": false, "source_url": "…|null",
                  "co_investors": ["Seedcamp", "…"] }],
      "bridges": [{ "uuid": "…", "name": "Seedcamp", "shared_deals": 3 }]
    }
  ],
  "bridges": [
    { "uuid": "…", "name": "Seedcamp", "hq_country": "United Kingdom|null", "dealroom_url": "…",
      "shared_deals_with_us": 9, "us_partners": ["Y Combinator", "Techstars"], "deals_led": 4 }
  ],
  "graph": {
    "nodes": [{ "id": "<uuid>", "label": "Y Combinator", "kind": "us_investor|bridge_investor|company" }],
    "edges": [{ "source": "<investor uuid>", "target": "<company uuid>", "is_lead": true }]
  },
  "caveats": ["Valuations may include Dealroom estimates.", "2026 is a partial year."]
}
```

`investors` is sorted by `score` descending, with at most 25 entries. `bridges` lists non-US investors who co-invested with ≥1 US investor in the cohort, sorted by `shared_deals_with_us`, with at most 15. `graph` holds the top 12 US investors, the top 8 bridges and their shared companies (≤ 80 nodes).

## `GET /api/thesis?investor=<uuid>&industry=125403&stages=Pre-Seed|Seed&region=93`

"Says vs does". This is slower (5–15s) because it fetches the investor's website, so the frontend should load it lazily when an investor card is opened.

```json
{
  "investor": { "uuid": "…", "name": "…", "domain": "…" },
  "stated": { "source_urls": ["https://…"], "fetched_at": "…", "method": "keyword|llm|unavailable",
              "stages": ["Pre-Seed", "Seed"], "sectors": ["Health"], "geographies": ["US", "Europe"],
              "cheque": { "min": 100000, "max": 2000000 } , "quotes": ["We back founders at pre-seed…"] },
  "revealed": { "stages": { "Seed": 4, "Pre-Seed": 2 }, "industry_deals": 6, "region_deals": 6, "leads": 1, "last_deal": "2026-08" },
  "verdict": { "stage": "match|mismatch|unknown", "sector": "match|mismatch|unknown", "geography": "match|mismatch|unknown",
               "summary": "Says it backs seed-stage health globally; has done 6 UK health pre-seed/seed deals since 2024 (led 1)." }
}
```
