> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Known limitations

> Current data coverage and API constraints to account for when building with the Dealroom API.

Use this page to plan fallback behavior for data that is unavailable, sparse, or
handled differently by a specific endpoint.

<Info>
  The [Filters & Sorting reference](/references/filters-and-sorting) is the
  source of truth for supported filters. An unsupported filter is rejected with
  a `400 UNKNOWN_FILTER` error rather than ignored.
</Info>

## Data coverage

### Jobs cover active openings only

`GET /data/jobs` and `GET /data/jobs/{id}` return active job openings. Expired
openings are not included.

The following fields are not available because coverage is too limited:

* Salary range
* Salary currency
* Department
* Contract type

Build job integrations around the fields exposed in the response, including
title, source, location, job type, posting language, posting date, and hiring
company.

### Some company financials are sparse

The `profit` and `rnd` fields returned by
`GET /data/companies/{id}/financials` depend on company filings. Many companies
do not report them, and research and development spend is especially sparse.
Treat both fields as nullable and keep a missing-data state in your interface.

### Patent titles are sparse

`GET /data/{companies,universities,gov-ngo}/{id}/patents` returns one row per
patent family (companies, universities, and government/NGO entities only —
patents never attach to investors or individual people). `title` is populated
for roughly 1.6% of families — only when the data provider flagged one of the
family's publications as high-value. `family_id`, `status` (`granted` /
`pending`), `countries`, `publication_count`, `filing_date`, and
`publication_date` are always populated. Treat `title` as nullable and design
around the always-present fields.

### Patent categories are a flat list, not a taxonomy

`patent_category_id` filters entities by patent technology topic, but there is
no super/sub category hierarchy — topics are a flat, machine-extracted keyword
list (\~35,500 distinct values). Filtering by one topic id matches only that
exact topic; it does not also match narrower or related topics. Browse the
full topic list via `GET /reference/filters/patent_category_id/values`.

### Funding-round analytics exclude investments without a round

Analytics based on the `funding-rounds` source count investments associated
with a recorded funding round. Direct stakes, angel investments, and other
relationships without a funding-round record are not included in those
aggregates.

Use `GET /data/investors/{id}/portfolio` when you need the broader known
portfolio relationship. Use `funding-rounds` aggregates when the funding round
itself is the fact you want to measure.

### Exit and ownership detail is limited

Entity filtering supports `classification[in_any]:exited`, but exit type, amount, year, and
valuation are not exposed. Shareholder names, ownership percentages, and
cap-table data are also not available.

## Request behavior

### Fund-size filters use each fund's native currency

`GET /data/funds` converts the response `amount` to the requested `?currency=`
and preserves the original value in `amount_source`. The `amount` filter is
different: it compares the amount stored in each fund's native currency.

<Warning>
  Do not use an `amount` threshold to compare funds in mixed native currencies.
  Request the funds first and compare their converted response amounts when you
  need a single-currency threshold.
</Warning>

## Further reading

<CardGroup cols={2}>
  <Card title="Pagination" icon="list-ol" href="/concepts/pagination">
    See which collections use cursors and which remain offset-only.
  </Card>

  <Card title="Currencies" icon="coins" href="/concepts/currencies">
    Understand conversion behavior and native-currency fund amounts.
  </Card>
</CardGroup>
