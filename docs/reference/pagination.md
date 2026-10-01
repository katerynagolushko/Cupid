> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Pagination

> Use the `cursor` query parameter to walk through results, with `limit` controlling page size and `include_total` opting into a total count.

List endpoints support two pagination styles. Choose one for each request:

* **Cursor pagination** returns a token for the next or previous page. Its
  performance stays consistent as you move deeper into a result set, so it is
  the better choice for sequential browsing and large exports.
* **Offset pagination** uses `limit` and `offset` to jump directly to a numbered
  page. It is convenient for shallow random access, but deeper offsets take more
  work to query.

On endpoints that support both styles, they produce the same response envelope;
only the request shape differs. Cursor wins when both are sent
(`?cursor=X&offset=N` ignores the offset). Offset-only endpoints use the simpler
response shape described at the end of this page.

`page.total` is omitted by default because counting every matching row requires
an additional query. Add `include_total=true` when your interface needs the total.

<Warning>
  The cursor changes name between the response and the request. The response
  returns it as `page.next_cursor`, but you send it back as `cursor=`. Unknown
  query parameters are ignored rather than rejected, so a request built with
  `next_cursor=` returns the first page again, with no error. A loop written
  that way never advances.
</Warning>

## Parameters

| Parameter | Type | Default | Description |
| - | - | - | - |
| `cursor` | string | — | Opaque token from a previous response's `page.next_cursor` or `page.prev_cursor`. **When present, the cursor carries its own `limit` and `offset` — `?limit=` and `?offset=` on the request are ignored.** |
| `limit` | integer | `25` | Page size. Used when no `cursor` is sent. Max varies by endpoint. |
| `offset` | integer | `0` | Number of rows to skip. Used when no `cursor` is sent (offset pagination). Echoed in `page.offset` when a cursor is used (the cursor carries it). |
| `include_total` | boolean | — | Pass `true` to include `page.total` (runs a separate COUNT query). |
| `view` | string | `full` | Entity collections only: `full` rows, or `summary` rows without the full-only blocks (priced lower). Echoed as `view` in the response. |

## Limits

Page size and pagination depth are separate axes: page size bounds a single response, depth
(`offset + limit`) bounds how far you can page. Each endpoint has a hard page-size ceiling:

| Endpoint | Max `limit` |
| - | - |
| `/data/companies`, `/data/entities`, `/data/investors`, `/data/founders`, `/data/people`, `/data/universities`, `/data/gov-ngo` | 500 |
| `/data/transactions`, `/data/valuations`, `/data/jobs`, `/data/news` | 2000 |
| `/data/funds` | 2000 |
| `/data/companies/geo` | 5000 |
| `/analytics/*` (aggregates) | 500 |
| `/reference/*` (taxonomy) | 1000 |

### Limits for browser and keyless requests

Browser sessions and requests without an API key have lower page-size and depth
limits. Programmatic API-key requests use the endpoint maximum above and have no
pagination-depth cap.

| Request context | Max page size | Max depth (`offset + limit`) |
| - | - | - |
| No authenticated user | 50 | 750 |
| Standard user session | 100 | 5,000 |
| Premium user session | 500 | 50,000 |
| Programmatic API key | endpoint max (above) | unbounded |

Page size is clamped, not rejected. An over-limit browser or keyless request
returns the reduced size and sets `page.capped` to `true`. These session-specific
caps apply to core list endpoints only; geo, taxonomy, and aggregate endpoints
are not capped this way.

Depth applies to every list endpoint, on both the offset and cursor styles. A request beyond the cap
returns `400` with error code `PAGINATION_DEPTH_EXCEEDED` — the page is **not** silently truncated.

## Response shape

```json theme={null}
{
  "data": [
    {
      "uuid": "345d1ab6-33df-4759-9e17-0d0c0ec9ab1c",
      "name": "Example Corp",
      "type": "organization"
    }
  ],
  "page": {
    "limit": 25,
    "offset": 0,
    "next_cursor": "eyJ2IjoxLCJkIjoibmV4dCJ9...",
    "prev_cursor": null,
    "total": 5634
  }
}
```

* `page.limit` — applied page size (carried by the cursor on subsequent pages)
* `page.offset` — the server's view of where this page sits in the result set (`0` for the first page, `limit` for the second, etc.). Use it for "showing rows X–Y of Z" display
* `page.next_cursor` — token to fetch the next page, or `null` when this is the last page
* `page.prev_cursor` — token to fetch the previous page, or `null` when this is the first page
* `page.total` — total matching records; present only when `include_total=true`

## Walking forward (cursor)

<CodeGroup>
  ```bash cURL theme={null}
  # Page 1: save the response, then extract its next cursor with jq
  FIRST_PAGE=$(curl -s "https://api.beta.dealroom.app/data/entities?sort=-launch_date&filter=organization_subtype%5Beq%5D%3Acompany&limit=25" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: $DEALROOM_CLIENT_ID")
  NEXT_CURSOR=$(printf '%s' "$FIRST_PAGE" | jq -r '.page.next_cursor // empty')
  test -n "$NEXT_CURSOR" || { echo "No next page" >&2; exit 1; }

  # Page 2: round-trip the cursor and echo the same sort and filter.
  # The cursor carries limit/offset for you; sort and filter must match the
  # request that minted the cursor or the server returns 400.
  SECOND_PAGE=$(curl -sG "https://api.beta.dealroom.app/data/entities" \
    --data-urlencode "cursor=$NEXT_CURSOR" \
    --data-urlencode "sort=-launch_date" \
    --data-urlencode "filter=organization_subtype[eq]:company" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: $DEALROOM_CLIENT_ID")

  printf '%s\n' "$SECOND_PAGE" | jq .
  ```

  ```batch Windows CMD theme={null}
  REM Page 1: save the response, then extract its next cursor with jq
  curl -s "https://api.beta.dealroom.app/data/entities?sort=-launch_date&filter=organization_subtype%5Beq%5D%3Acompany&limit=25" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" > page1.json

  set "NEXT_CURSOR="
  for /f "delims=" %A in ('jq -r ".page.next_cursor // empty" page1.json') do set NEXT_CURSOR=%A
  if not defined NEXT_CURSOR (
    echo No next page
    exit /b 1
  )

  REM Page 2: round-trip the cursor and echo the same sort and filter.
  REM The cursor carries limit/offset for you; sort and filter must match the
  REM request that minted the cursor or the server returns 400.
  curl -sG "https://api.beta.dealroom.app/data/entities" ^
    --data-urlencode "cursor=%NEXT_CURSOR%" ^
    --data-urlencode "sort=-launch_date" ^
    --data-urlencode "filter=organization_subtype[eq]:company" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" > page2.json

  jq . page2.json
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = $env:DEALROOM_CLIENT_ID
  }

  # Page 1: read the next cursor straight off the parsed response
  $firstPage = Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/data/entities" -Headers $headers -Body @{
    sort   = "-launch_date"
    filter = "organization_subtype[eq]:company"
    limit  = 25
  }

  if (-not $firstPage.page.next_cursor) { throw "No next page" }

  # Page 2: round-trip the cursor and echo the same sort and filter.
  # The cursor carries limit/offset for you; sort and filter must match the
  # request that minted the cursor or the server returns 400.
  $secondPage = Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/data/entities" -Headers $headers -Body @{
    cursor = $firstPage.page.next_cursor
    sort   = "-launch_date"
    filter = "organization_subtype[eq]:company"
  }

  $secondPage | ConvertTo-Json -Depth 10
  ```
</CodeGroup>

## Random access (offset)

<CodeGroup>
  ```bash cURL theme={null}
  # Jump straight to page 11 (offset=250 with limit=25):
  curl "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=25&offset=250" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: $DEALROOM_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  REM Jump straight to page 11 (offset=250 with limit=25):
  curl "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=25&offset=250" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = $env:DEALROOM_CLIENT_ID
  }

  # Jump straight to page 11 (offset=250 with limit=25):
  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=25&offset=250" -Headers $headers |
    ConvertTo-Json -Depth 10
  ```
</CodeGroup>

Offset cost grows with the offset value, so prefer cursor walking for deep pages.
Offset is fine for small jumps and one-shot fetches. Browser and keyless requests
that exceed their depth limit return `400 PAGINATION_DEPTH_EXCEEDED`.

## Walking back

<CodeGroup>
  ```bash cURL theme={null}
  # Continuing from the forward example, extract and replay the previous cursor.
  PREV_CURSOR=$(printf '%s' "$SECOND_PAGE" | jq -r '.page.prev_cursor // empty')
  test -n "$PREV_CURSOR" || { echo "No previous page" >&2; exit 1; }

  curl -sG "https://api.beta.dealroom.app/data/entities" \
    --data-urlencode "cursor=$PREV_CURSOR" \
    --data-urlencode "sort=-launch_date" \
    --data-urlencode "filter=organization_subtype[eq]:company" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: $DEALROOM_CLIENT_ID" \
    | jq .
  ```

  ```batch Windows CMD theme={null}
  REM Continuing from the forward example, read the previous cursor out of page2.json.
  set "PREV_CURSOR="
  for /f "delims=" %A in ('jq -r ".page.prev_cursor // empty" page2.json') do set PREV_CURSOR=%A
  if not defined PREV_CURSOR (
    echo No previous page
    exit /b 1
  )

  curl -sG "https://api.beta.dealroom.app/data/entities" ^
    --data-urlencode "cursor=%PREV_CURSOR%" ^
    --data-urlencode "sort=-launch_date" ^
    --data-urlencode "filter=organization_subtype[eq]:company" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" | jq .
  ```

  ```powershell PowerShell theme={null}
  # Continuing from the forward example, replay the previous cursor.
  if (-not $secondPage.page.prev_cursor) { throw "No previous page" }

  Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/data/entities" -Headers $headers -Body @{
    cursor = $secondPage.page.prev_cursor
    sort   = "-launch_date"
    filter = "organization_subtype[eq]:company"
  } | ConvertTo-Json -Depth 10
  ```
</CodeGroup>

`prev_cursor` is `null` exactly when you're on the first page.

For a "Page N of M" UI, read `page.offset` and `page.limit` straight from the response — the cursor token already carries the current offset, so the server reports it back without the client doing any arithmetic.

## Cursor rules

* **Opaque** — treat the cursor as a black box. Do not decode, modify, or construct it manually.
* **Carries limit/offset only** — the cursor token embeds page size and offset, so `?limit=` and `?offset=` are ignored when `?cursor=` is sent. To change page size, restart from the first page with the new `?limit=`.
* **Echo `sort` and `filter` on every request** — the cursor does NOT contain the sort or filter expression. The server compares the cursor's fingerprints against the *resolved* sort and filter of the current request, so the rule is "the request's resolved sort/filter must match what minted the cursor." In practice that means resending the same `?sort=` and `?filter=` you used on page 1. Technically, if a cursor was minted under default sort and empty filter, omitting both is fine because the defaults still match — but the safe pattern is to always echo them so client code doesn't break the moment a non-default sort or filter is in play. Mismatch returns a 400.
* **Bound to sort** — changing `?sort=` mid-paging returns `400 Invalid cursor for this sort order; restart from the first page`.
* **Bound to filter** — changing `?filter=` mid-paging returns `400 Cursor is bound to a different filter; restart from the first page`. Currency (`?currency=`) and view (`?view=`) are **not** bound — switching either mid-paging is safe.
* **No random jumps** — cursors are sequential: no cursor jumps straight to an arbitrary page (e.g. "page 47"). Walk `next_cursor` / `prev_cursor`, or restart from the first page. Offset pagination allows random access; browser and keyless requests remain subject to their depth limits.

## Including the total count

By default `page.total` is omitted — cursor pages stay cheap. Pass `include_total=true` to include it:

<CodeGroup>
  ```bash cURL theme={null}
  curl "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=25&include_total=true" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: $DEALROOM_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  curl "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=25&include_total=true" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = $env:DEALROOM_CLIENT_ID
  }

  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=25&include_total=true" -Headers $headers |
    ConvertTo-Json -Depth 10
  ```
</CodeGroup>

For large datasets, skip the total count when you don't need it — omitting it avoids a full-table count query.

<Note>
  Cursor pagination is not available on nested data collections such as company
  funding rounds and valuations, investor portfolios and funds, team, career,
  founded-company, LP-fund, and alumni endpoints. These are offset-only and use
  `{ limit, offset, total }`.
</Note>

## Further reading

<CardGroup cols={2}>
  <Card title="Filtering" icon="filter" href="/concepts/filtering">
    Build the stable filter expression that must accompany every cursor request.
  </Card>

  <Card title="Rate limits" icon="gauge-high" href="/concepts/rate-limits">
    Design larger result walks to stay within your request budget.
  </Card>
</CardGroup>
