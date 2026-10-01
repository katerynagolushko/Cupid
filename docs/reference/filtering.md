> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Filtering

> Narrow Dealroom API results with comparison operators, logical expressions, and filters discovered from the generated reference.

Filters use a single `filter` query parameter with an expression string:

```text theme={null}
filter=<expression>
```

## Expression syntax

| Form | Syntax | Example |
| - | - | - |
| Single | `field[op]:value` | `total_funding[gte]:1000000` |
| AND | `and(expr,expr,...)` | `and(total_funding[gte]:1000000,hq_location[eq]:233)` |
| OR | `or(expr,expr,...)` | `or(hq_location[eq]:628061,hq_location[eq]:1297711)` |
| Nested | `and(or(...),expr)` | `and(or(hq_location[eq]:628061,hq_location[eq]:1297711),total_funding[gte]:1000000)` |
| Cross-ref | `relation__field[op]:value` | `investor__total_invested[gte]:100000000` |

## Operators

| Operator | Description |
| - | - |
| `eq` | Exact match |
| `neq` | Not equal |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `in_any` | Matches any of the given values |
| `nin_any` | Matches none of the given values |
| `in_all` | Every requested value exists across related records |
| `nin_all` | At least one requested value is absent across related records |

`in_all` and `nin_all` are available only when a repeated-record filter lists
them in its discovered `operators`. They do not apply to scalar fields or every
relationship filter. Use `nin_any` when no related record may match any of the
requested values.

## Examples

### Filter by location

Locations are matched by numeric ID from the Dealroom location taxonomy, not by
name. Look up an ID once via `GET /reference/filters/location/values` and reuse
it:

<CodeGroup>
  ```bash cURL theme={null}
  # Discover the ID. Every row carries `type` and `parent_name`
  curl "https://api.beta.dealroom.app/reference/filters/location/values?q=United+States" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"

  # Then filter
  curl -g "https://api.beta.dealroom.app/data/entities?sort=-launch_date&filter=hq_location[eq]:233" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  REM Discover the ID. Every row carries `type` and `parent_name`
  curl "https://api.beta.dealroom.app/reference/filters/location/values?q=United+States" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"

  REM Then filter
  curl -g "https://api.beta.dealroom.app/data/entities?sort=-launch_date&filter=hq_location[eq]:233" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  # Discover the ID. Every row carries `type` and `parent_name`
  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/reference/filters/location/values?q=United+States" -Headers $headers

  # Then filter
  $query = @{
    sort   = "-launch_date"
    filter = "hq_location[eq]:233"
  }

  Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/data/entities" -Headers $headers -Body $query
  ```
</CodeGroup>

Each value carries the two fields you need to identify it:

```json theme={null}
{
  "id": 233,
  "name": "United States",
  "type": "country",
  "parent_name": null,
  "entity_count": null
}
```

<Warning>
  A name match is not unique - read `type` and `parent_name` to determine which
  ID you want for your search.
</Warning>

<Note>
  `entity_count` is `null` unless you pass `include_counts=true`. Counting the
  matching entities for every value is a separate scan per page, so it is
  opt-in. Add it only when you are rendering the counts, and prefer scoping the
  lookup with `?type=` when you do - an untyped lookup for a broad term such as
  `Europe` has to count across every taxonomy level at once and can time out.
</Note>

Narrow the lookup with `?type=` to search a single taxonomy level - always worth
doing, and required in practice if you also ask for counts. It accepts
`continent`, `country`, `state`, `city`, and `region`:

<CodeGroup>
  ```bash cURL theme={null}
  curl "https://api.beta.dealroom.app/reference/filters/location/values?q=London&type=city" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  curl "https://api.beta.dealroom.app/reference/filters/location/values?q=London&type=city" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/reference/filters/location/values?q=London&type=city" -Headers $headers
  ```
</CodeGroup>

Combined regions such as "London + Paris" are `type: "region"`, alongside genuine
geographic regions, so `type=city` rules them out. Five cities are still named
"London" though, and only `parent_name` separates those.

### Filter by industry (match any)

Industries (and other taxonomy values) live behind the `taxonomy_id` filter. Pass
`?type=industry` on the values endpoint to scope the lookup, then pipe-separate
the resulting IDs in the filter expression:

<CodeGroup>
  ```bash cURL theme={null}
  # Discover IDs first — returns { id: 126403, name: "Fintech", ... } etc.
  curl "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"

  # Then filter — pipe-separate to match any of several tags
  # (126403 = Fintech, 202 = Artificial Intelligence)
  curl -g "https://api.beta.dealroom.app/data/entities?sort=-latest_valuation&filter=taxonomy_id[in_any]:126403|202" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  REM Discover IDs first — returns { id: 126403, name: "Fintech", ... } etc.
  curl "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"

  REM Then filter — pipe-separate to match any of several tags
  REM (126403 = Fintech, 202 = Artificial Intelligence)
  curl -g "https://api.beta.dealroom.app/data/entities?sort=-latest_valuation&filter=taxonomy_id[in_any]:126403|202" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  # Discover IDs first — returns { id: 126403, name: "Fintech", ... } etc.
  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry" -Headers $headers

  # Then filter — pipe-separate to match any of several tags
  # (126403 = Fintech, 202 = Artificial Intelligence)
  $query = @{
    sort   = "-latest_valuation"
    filter = "taxonomy_id[in_any]:126403|202"
  }

  Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/data/entities" -Headers $headers -Body $query
  ```
</CodeGroup>

The `type` parameter accepts: `industry`, `sub_industry`, `sector`, `technology`,
`business_model`, `income_stream`, `client_focus`, `sdg`, `ownership`,
`techstack_category`, `growth_stage`, `investor_type`.

<Warning>
  A lookup scoped to the wrong `type` returns an **empty `200`**, not an error —
  e.g. "Artificial Intelligence" is a `technology` tag, so
  `?q=artificial&type=industry` finds nothing. When unsure, omit `type` to
  search across all tag types.
</Warning>

### Combine multiple filters

Use `and()` to require all conditions:

<CodeGroup>
  ```bash cURL theme={null}
  # 323 = Netherlands (discover via /reference/filters/location/values — never guess IDs)
  curl -g "https://api.beta.dealroom.app/data/entities?sort=-launch_date&filter=and(hq_location[eq]:323,launch_date[gte]:2018,total_funding[gte]:1000000)" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  REM 323 = Netherlands (discover via /reference/filters/location/values — never guess IDs)
  curl -g "https://api.beta.dealroom.app/data/entities?sort=-launch_date&filter=and(hq_location[eq]:323,launch_date[gte]:2018,total_funding[gte]:1000000)" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  # 323 = Netherlands (discover via /reference/filters/location/values — never guess IDs)
  $query = @{
    sort   = "-launch_date"
    filter = "and(hq_location[eq]:323,launch_date[gte]:2018,total_funding[gte]:1000000)"
  }

  Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/data/entities" -Headers $headers -Body $query
  ```
</CodeGroup>

### Cross-reference filter

Filter companies by the total size of the rounds their investors participated in:

```text theme={null}
filter=investor__total_invested[gte]:100000000
```

## Enum filters

Some filters accept a value from a **fixed, closed set** rather than free text or an
ID. Discover the valid values with the values endpoint — same as `id_lookup` filters:

<CodeGroup>
  ```bash cURL theme={null}
  # Each value has the shape { id, code, name, entity_count },
  # e.g. { "id": 2, "code": "series_a", "name": "SERIES A", "entity_count": null }
  curl "https://api.beta.dealroom.app/reference/filters/round_type/values" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  REM Each value has the shape { id, code, name, entity_count },
  REM e.g. { "id": 2, "code": "series_a", "name": "SERIES A", "entity_count": null }
  curl "https://api.beta.dealroom.app/reference/filters/round_type/values" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  # Each value has the shape { id, code, name, entity_count },
  # e.g. { "id": 2, "code": "series_a", "name": "SERIES A", "entity_count": null }
  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/reference/filters/round_type/values" -Headers $headers
  ```
</CodeGroup>

You can commit either the `name` (`SERIES A`) or its `code` (`series_a`) as the filter value.

The following canonicalized enum filters match **case-insensitively** and
**reject unknown values** with a `400 FILTER_VALIDATION_ERROR` rather than
silently returning no results:

| Filter | Used on |
| - | - |
| `round_type` | `/data/transactions`, `/data/news` |
| `preferred_round` | `/data/investors` |
| `investor_type` | `/data/investors` |
| `article_type` | `/data/news` |

Because matching is case-insensitive, `series a` and `SERIES A` are equivalent:

<CodeGroup>
  ```bash cURL theme={null}
  # "series a" resolves to the canonical "SERIES A"
  curl -g "https://api.beta.dealroom.app/data/transactions?filter=round_type[eq]:series%20a" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  REM "series a" resolves to the canonical "SERIES A"
  curl -g "https://api.beta.dealroom.app/data/transactions?filter=round_type[eq]:series%20a" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  # "series a" resolves to the canonical "SERIES A"
  $query = @{
    filter = "round_type[eq]:series a"
  }

  Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/data/transactions" -Headers $headers -Body $query
  ```
</CodeGroup>

A value outside the set returns an error instead of an empty result — see
[Errors](/concepts/errors):

```json theme={null}
{
  "error": {
    "code": "FILTER_VALIDATION_ERROR",
    "message": "Invalid value for filter 'round_type': \"seriesa\". See /reference/filters/round_type/values for accepted values.",
    "details": { "filter": "round_type" }
  }
}
```

## Sorting

Use the `sort` parameter with a field name. Prefix with `-` for descending order.

```text theme={null}
sort=-launch_date      # newest first
sort=-total_funding    # highest funded first
```

The full list of accepted sort keys per resource is in the
[Filters & Sorting Reference](/references/filters-and-sorting).

<Note>
  A sort or filter key doesn't always match a top-level response field.
  `total_funding`, for example, sorts and filters companies by the value
  returned at `funding_summary.total_funding` — there is no top-level
  `total_funding` field on the entity. Check the object pages from the [API
  Reference overview](/endpoint-overviews/discovery) for where a value appears
  in the response.
</Note>

## Available filters

For a complete list of all filters and sort keys grouped by scope, see the
[Filters & Sorting Reference](/references/filters-and-sorting).

You can also fetch available filters programmatically:

<CodeGroup>
  ```bash cURL theme={null}
  curl "https://api.beta.dealroom.app/reference/filters?scope=companies" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  curl "https://api.beta.dealroom.app/reference/filters?scope=companies" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/reference/filters?scope=companies" -Headers $headers
  ```
</CodeGroup>

The discovery response is the authoritative inventory for each public scope. It
includes each filter's type, supported operators, and any `sub_types` used for
value lookup. Explicit cross-reference filters appear in their relevant scopes;
dynamically constructible relationship paths are not listed exhaustively.

## Further reading

<CardGroup cols={2}>
  <Card title="Top fintech startups" icon="code" href="/examples/top-startups">
    Apply taxonomy lookup, filtering, and sorting in a complete query.
  </Card>

  <Card title="Pagination" icon="list-ol" href="/concepts/pagination">
    Walk through a filtered result set without changing the query.
  </Card>
</CardGroup>
