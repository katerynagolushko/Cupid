> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Analytics and aggregates

> Compute grouped metrics, time series, funding distributions, and investor matches without downloading the underlying records.

The analytics endpoints answer questions such as “How much funding did each sector
raise?” or “Which countries have the most startups?” without requiring you to
download and process every matching record.

Start with an aggregate when you need a total or breakdown. The other analytics
endpoints return purpose-built shapes for time series, funding visualisations, and
investor matching.

<Info>
  The aggregate endpoints and `GET /analytics/timeseries` are being promoted
  into the versioned public contract. Until that lands they are absent from the
  API Reference tab, so use this page as their reference. The funding-analytics
  and investor-matching endpoints stay outside the contract: their parameters
  and response shapes may change based on open beta feedback.
</Info>

## Choose an analytics endpoint

| What you need | Endpoint |
| - | - |
| One or more metrics grouped by dimensions | `GET /analytics/aggregate/{source}` |
| Labeled metrics with per-metric filters or no grouping | `GET /analytics/aggregate/{source}/multi-metric` |
| One metric as a yearly series | `GET /analytics/timeseries` |
| A funding heatmap | `GET /analytics/funding-analytics/heatmap` |
| Funding-stage transitions | `GET /analytics/funding-analytics/round-transitions` |
| Companies grouped into funding buckets | `GET /analytics/funding-analytics/funnel` |
| Ranked investors for a company and deal profile | `GET /analytics/matching/investors` |

Use a `/data` endpoint instead when you need individual records rather than a
calculated result. Browse the
[API Reference overview](/endpoint-overviews/discovery) for the published data
and reference endpoints.

## Run a grouped aggregate

This request counts funding rounds by company HQ country for rounds reported in 2024. It returns at most ten groups, ordered by the count from highest to lowest.

<CodeGroup>
  ```bash cURL theme={null}
  curl -G "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID" \
    --data-urlencode "metric=count" \
    --data-urlencode "group_by=hq_country" \
    --data-urlencode "filter=year[eq]:2024" \
    --data-urlencode "sort=-count" \
    --data-urlencode "limit=10"
  ```

  ```batch Windows CMD theme={null}
  curl -G "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID" ^
    --data-urlencode "metric=count" ^
    --data-urlencode "group_by=hq_country" ^
    --data-urlencode "filter=year[eq]:2024" ^
    --data-urlencode "sort=-count" ^
    --data-urlencode "limit=10"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  $query = @{
    metric   = "count"
    group_by = "hq_country"
    filter   = "year[eq]:2024"
    sort     = "-count"
    limit    = 10
  }

  Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds" -Headers $headers -Body $query |
    ConvertTo-Json -Depth 10
  ```
</CodeGroup>

A successful response has three top-level fields:

```json theme={null}
{
  "data": [
    { "dimension": "United States", "count": 12000 },
    { "dimension": "United Kingdom", "count": 3500 },
    { "dimension": "Germany", "count": 2200 }
  ],
  "query_info": {
    "source": "funding-rounds",
    "group_by": "hq_country",
    "metric": "count",
    "total_groups": 3
  },
  "currency": "USD"
}
```

* `data` contains the calculated rows.
* `query_info` echoes the source, dimensions, and metrics used for the query.
* `currency` identifies the currency used for monetary values.

`total_groups` is the number of groups returned, not a count of every possible
group. Aggregate results do not use cursor or offset pagination. Use `limit` to
return between 1 and 500 groups; the default is 25.

## How an aggregate request works

Every aggregate request combines four parts:

1. `source` selects the records being analysed.
2. `filter` narrows those records before metrics are calculated.
3. `group_by` splits the matching records into result rows.
4. `metric` defines the calculation for each row.

For example, a query with `source=funding-rounds`, `filter=year[eq]:2024`,
`group_by=sector`, and `metric=sum:amount` returns the total funding raised in
2024 for each sector.

### Sources

| Source | Records analysed |
| - | - |
| `companies` | Organisations classified as companies |
| `funding-rounds` | Individual funding rounds |
| `valuations` | The latest valuation per entity and year |
| `founders` | People classified as founders |
| `investors` | Organisations classified as investors |

### Metrics

Metric support depends on the source. These are the supported combinations:

| Source | Metrics |
| - | - |
| `companies` | `count`; `sum:total_funding`; `avg:signal_rating`; `median:signal_rating`; `sum`, `avg`, `median`, or `max` of `latest_valuation`; `sum`, `avg`, or `median` of `latest_revenue` |
| `funding-rounds` | `count`; `count_distinct:entity_id`; `sum`, `avg`, `median`, `p25`, or `p75` of `amount` |
| `valuations` | `count`; `count_distinct:entity_id`; `sum`, `avg`, `median`, `p25`, or `p75` of `value` |
| `founders` | `count` |
| `investors` | `count` |

Write a metric as `operation:field`, such as `sum:amount`. `count` does not need
a field. You can request more than one metric by separating them with commas:

```text theme={null}
metric=count,sum:amount
```

The result keys replace the colon with an underscore, so `sum:amount` becomes
`sum_amount`.

An unsupported metric returns a validation error that lists the metrics available
for the selected source.

### Dimensions

Dimensions also depend on the source. Common examples include:

| Category | Examples |
| - | - |
| Location | `hq_country`, `hq_city`, `hq_continent`, `macro_region`, `region` |
| Time | `year`, `quarter`, `launch_year` |
| Taxonomy | `sector`, `technology`, `industry`, `business_model`, `sdg` |
| Funding | `round_type`, `standardized_round` |
| Investor | `investor_type`, `investor_country`, `investor_name` |
| Relationships | `university.name`, `employer.country`, `invested_in.name` |

Both aggregate endpoints accept multiple comma-separated dimensions:

```text theme={null}
group_by=year,hq_country
```

With one dimension, each result row uses the key `dimension`. With multiple
dimensions, each grouping key is named explicitly:

```json theme={null}
{
  "year": 2024,
  "hq_country": "Germany",
  "sum_amount": 2400000000
}
```

An unsupported dimension returns a validation error for the selected source.

### Filters

`filter` narrows the source records before grouping and calculation. It uses the
same structured syntax as list endpoints, including nested `and(...)` and `or(...)`
expressions.

```text theme={null}
filter=and(year[gte]:2020,company.classification[in_any]:vc_backed)
```

The available filters depend on the source. A filter valid for `/data/companies`
is not automatically valid for every aggregate source. See [Filtering](/concepts/filtering)
and the [Filters and sorting reference](/references/filters-and-sorting) for the
syntax and compatibility tables.

### Sorting and limits

Use `sort` with a metric result key or `dimension`. Prefix the key with `-` for
descending order. If you omit `sort`, results are sorted by the first metric in
descending order.

```text theme={null}
sort=-sum_amount
sort=dimension
```

Use `limit` to cap grouped results. There is no next page: aggregates return the
top 1 to 500 groups selected by the sort order.

### Currency

Add `currency=EUR` to convert monetary metrics and monetary filter thresholds.
The top-level `currency` response field confirms which currency was applied.

```text theme={null}
metric=sum:amount&filter=amount[gte]:1000000&currency=EUR
```

An explicit `currency` parameter takes precedence over an active ecosystem's
configured currency. Requests without either use USD. See
[Currencies](/concepts/currencies) for supported codes and
conversion behaviour.

## Calculate several labeled metrics

Use the multi-metric endpoint when you need custom result labels, per-metric
filters, percentages, or totals without any grouping.

Each `metric` parameter has the form `label,metric_type`. Repeat it to request
several calculations:

<CodeGroup>
  ```bash cURL theme={null}
  curl -G "https://api.beta.dealroom.app/analytics/aggregate/companies/multi-metric" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID" \
    --data-urlencode "metric=companies,count" \
    --data-urlencode "metric=unicorns,count" \
    --data-urlencode "metric=unicorn_share,percentage:unicorns/companies" \
    --data-urlencode "metric_filter=unicorns:classification[in_any]:unicorn" \
    --data-urlencode "group_by=hq_country" \
    --data-urlencode "metric_having=companies[gte]:100" \
    --data-urlencode "sort=-unicorn_share" \
    --data-urlencode "limit=10"
  ```

  ```batch Windows CMD theme={null}
  curl -G "https://api.beta.dealroom.app/analytics/aggregate/companies/multi-metric" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID" ^
    --data-urlencode "metric=companies,count" ^
    --data-urlencode "metric=unicorns,count" ^
    --data-urlencode "metric=unicorn_share,percentage:unicorns/companies" ^
    --data-urlencode "metric_filter=unicorns:classification[in_any]:unicorn" ^
    --data-urlencode "group_by=hq_country" ^
    --data-urlencode "metric_having=companies[gte]:100" ^
    --data-urlencode "sort=-unicorn_share" ^
    --data-urlencode "limit=10"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  $query = @(
    "metric=companies,count",
    "metric=unicorns,count",
    "metric=unicorn_share,percentage:unicorns/companies",
    "metric_filter=$([uri]::EscapeDataString('unicorns:classification[in_any]:unicorn'))",
    "group_by=hq_country",
    "metric_having=$([uri]::EscapeDataString('companies[gte]:100'))",
    "sort=-unicorn_share",
    "limit=10"
  ) -join "&"

  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/analytics/aggregate/companies/multi-metric?$query" -Headers $headers |
    ConvertTo-Json -Depth 10
  ```
</CodeGroup>

The response uses your labels as field names:

```json theme={null}
{
  "data": [
    {
      "dimension": "United States",
      "companies": 42000,
      "unicorns": 980,
      "unicorn_share": 2.33
    }
  ],
  "query_info": {
    "source": "companies",
    "group_by": "hq_country",
    "metrics": [
      { "label": "companies", "type": "count" },
      { "label": "unicorns", "type": "count" },
      {
        "label": "unicorn_share",
        "type": "percentage:unicorns/companies"
      }
    ],
    "total_groups": 1
  },
  "currency": "USD"
}
```

### Three levels of filtering

The multi-metric endpoint can filter at three different stages:

| Parameter | When it runs | Use it for |
| - | - | - |
| `filter` | Before every metric is calculated | A condition shared by the whole request |
| `metric_filter` | While one labeled metric is calculated | Conditional counts or sums within the same result row |
| `metric_having` | After grouped metrics are calculated | Removing groups that do not meet a calculated threshold |

For example, `metric_having=unicorn_share[gt]:2` keeps only countries where the
calculated `unicorn_share` is greater than 2. It does not remove source records
before the percentage is calculated.

`metric_having` accepts `gt`, `gte`, `lt`, `lte`, `eq`, and `neq`. It requires
`group_by`, and repeated conditions are combined with AND.

### Flat totals

Omit `group_by` to calculate totals across all matching records:

<CodeGroup>
  ```bash cURL theme={null}
  curl -G "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds/multi-metric" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID" \
    --data-urlencode "metric=rounds,count" \
    --data-urlencode "metric=companies,count_distinct:entity_id" \
    --data-urlencode "metric=raised,sum:amount" \
    --data-urlencode "filter=year[eq]:2024" \
    --data-urlencode "currency=EUR"
  ```

  ```batch Windows CMD theme={null}
  curl -G "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds/multi-metric" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID" ^
    --data-urlencode "metric=rounds,count" ^
    --data-urlencode "metric=companies,count_distinct:entity_id" ^
    --data-urlencode "metric=raised,sum:amount" ^
    --data-urlencode "filter=year[eq]:2024" ^
    --data-urlencode "currency=EUR"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  $query = @(
    "metric=rounds,count",
    "metric=companies,count_distinct:entity_id",
    "metric=raised,sum:amount",
    "filter=$([uri]::EscapeDataString('year[eq]:2024'))",
    "currency=EUR"
  ) -join "&"

  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds/multi-metric?$query" -Headers $headers |
    ConvertTo-Json -Depth 10
  ```
</CodeGroup>

Flat results still use a one-element `data` array:

```json theme={null}
{
  "data": [{ "rounds": 12500, "companies": 8900, "raised": 68000000000 }],
  "query_info": {
    "source": "funding-rounds",
    "metrics": [
      { "label": "rounds", "type": "count" },
      { "label": "companies", "type": "count_distinct:entity_id" },
      { "label": "raised", "type": "sum:amount" }
    ]
  },
  "currency": "EUR"
}
```

## Other analytics shapes

The generic aggregate endpoints cover totals and grouped breakdowns. Use the
purpose-built endpoints when their response shape matches the product you are
building:

* `GET /analytics/timeseries` returns one yearly series for employees, revenue,
  valuation, EBITDA, VC funding, unicorns, or VC-backed companies.
* `GET /analytics/funding-analytics/heatmap` returns sparse matrix cells and axis
  totals for two funding dimensions.
* `GET /analytics/funding-analytics/round-transitions` returns movements between
  funding stages and the median time between rounds.
* `GET /analytics/funding-analytics/funnel` returns company counts across nine
  funding buckets, optionally split by a dimension.
* `GET /analytics/matching/investors` ranks investors against a target company and
  deal profile.

These endpoints use the same authentication headers as the rest of the API. Their
permissions, available parameters, and specialised response shapes differ from the
generic aggregate model.

## Common mistakes

* Do not assume every source supports every metric, dimension, or filter.
* Do not use `total_groups` as a count of groups beyond the requested `limit`.
* Do not send `metric_having` without `group_by`.
* Do not filter a percentage metric directly. Apply `metric_filter` to the
  numerator or denominator metrics it references.
* Do not fetch and sum `/data` records when an aggregate can answer the same
  question within the API's pagination limits.

## Further reading

<CardGroup cols={2}>
  <Card title="Filtering" icon="filter" href="/concepts/filtering">
    Narrow the records included in an aggregate with the filter language.
  </Card>

  <Card title="Currencies" icon="coins" href="/concepts/currencies">
    Request monetary metrics and grouped results in a supported currency.
  </Card>
</CardGroup>
