> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Analyse a funding market

> Measure how much capital a sector and region attract, how deal sizes have shifted, and which investors are most active.

A market analysis in five requests. This example measures venture funding into
European AI companies: how much capital the market absorbs each year, whether
deal count is rising or falling with it, what a typical round now looks like,
and who is deploying.

Two taxonomy lookups resolve the market, then three aggregates measure it.
Together they answer a question that no single
endpoint answers on its own, which is the point: the analytics endpoints are
composable, so you assemble a view rather than fetching a prebuilt one.

<Note>
  To analyse a different market, change the two lookups in step 2. Every later
  request reuses the IDs they return, so nothing else needs editing. Pass `type`
  on both lookups: an untyped search matches every taxonomy row containing your
  term, which is slower and returns rows you did not ask for.
</Note>

## Prerequisites

* Complete the [Quickstart](/getting-started/quickstart) to create an API key
  and make your first request.
* `DEALROOM_CLIENT_ID` and `DEALROOM_CLIENT_SECRET` exported as environment variables.
* [`jq`](https://jqlang.github.io/jq/) for the cURL and Command Prompt snippets. The
  PowerShell, Node.js, and Python variants don't require it.

## The recipe

<CodeGroup>
  ```bash cURL theme={null}
  # 1. Exchange credentials for a Bearer token
  ACCESS_TOKEN=$(curl -s -X POST "https://accounts.dealroom.co/oauth/token" \
    -H "Content-Type: application/json" \
    -d "{
      \"client_id\": \"$DEALROOM_CLIENT_ID\",
      \"client_secret\": \"$DEALROOM_CLIENT_SECRET\",
      \"audience\": \"https://api.beta.dealroom.app\",
      \"grant_type\": \"client_credentials\"
    }" | jq -r '.access_token')

  dr() {
    curl -s -G "https://api.beta.dealroom.app$1" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "X-Client-Id: $DEALROOM_CLIENT_ID" "${@:2}"
  }

  # 2. Resolve the market definition to IDs. Never hardcode taxonomy IDs.
  #    A lookup can return several matches, so select by exact name rather than
  #    taking the first row, and stop if there is no match.
  TAG_ID=$(dr /reference/filters/taxonomy_id/values \
    --data-urlencode "q=artificial intelligence" \
    --data-urlencode "type=technology" \
    | jq -r '.data[] | select((.name | ascii_downcase) == "artificial intelligence") | .id' \
    | head -n 1)
  test -n "$TAG_ID" || { echo "Artificial Intelligence tag not found" >&2; exit 1; }

  GEO_ID=$(dr /reference/filters/location/values \
    --data-urlencode "q=Europe" \
    --data-urlencode "type=continent" \
    | jq -r '.data[] | select((.name | ascii_downcase) == "europe") | .id' \
    | head -n 1)
  test -n "$GEO_ID" || { echo "Europe continent not found" >&2; exit 1; }

  MARKET="taxonomy_id[in_any]:$TAG_ID,hq_location[eq]:$GEO_ID,is_vc_round[eq]:true"

  # 3. Size and momentum: capital raised and deal count per year
  echo "Year  Rounds  Raised"
  dr /analytics/aggregate/funding-rounds \
    --data-urlencode "metric=count,sum:amount" \
    --data-urlencode "group_by=year" \
    --data-urlencode "filter=and($MARKET,year[gte]:2021)" \
    --data-urlencode "sort=dimension" \
    --data-urlencode "currency=USD" \
    | jq -r '.data[] | "\(.dimension)  \(.count)  $\(.sum_amount / 1000000000 * 10 | round / 10)B"'

  # 4. Deal shape: what a typical round looks like.
  #    amount[gte]:1 drops rounds with no disclosed amount.
  echo "Year  Rounds  p25  Median  p75"
  dr /analytics/aggregate/funding-rounds \
    --data-urlencode "metric=count,p25:amount,median:amount,p75:amount" \
    --data-urlencode "group_by=year" \
    --data-urlencode "filter=and($MARKET,amount[gte]:1,year[gte]:2021)" \
    --data-urlencode "sort=dimension" \
    --data-urlencode "currency=USD" \
    | jq -r '.data[] | "\(.dimension)  \(.count)  $\(.p25_amount / 1000000 * 10 | round / 10)M  $\(.median_amount / 1000000 * 10 | round / 10)M  $\(.p75_amount / 1000000 * 10 | round / 10)M"'

  # 5. Who is deploying into this market
  echo "Investor  Rounds  Participated in"
  dr /analytics/aggregate/funding-rounds \
    --data-urlencode "metric=count,sum:amount" \
    --data-urlencode "group_by=investor_name" \
    --data-urlencode "filter=and($MARKET,year[gte]:2024)" \
    --data-urlencode "sort=-count" \
    --data-urlencode "limit=10" \
    --data-urlencode "currency=USD" \
    | jq -r '.data[] | "\(.dimension)  \(.count)  $\(.sum_amount / 1000000 | round)M"'
  ```

  ```batch Windows CMD theme={null}
  REM 1. Exchange credentials for a Bearer token
  curl -s -X POST "https://accounts.dealroom.co/oauth/token" ^
    -H "Content-Type: application/json" ^
    -d "{\"client_id\": \"%DEALROOM_CLIENT_ID%\", \"client_secret\": \"%DEALROOM_CLIENT_SECRET%\", \"audience\": \"https://api.beta.dealroom.app\", \"grant_type\": \"client_credentials\"}" > token.json
  for /f "delims=" %A in ('jq -r .access_token token.json') do set ACCESS_TOKEN=%A
  del token.json

  REM 2. Resolve the market definition to IDs. Never hardcode taxonomy IDs.
  REM    A lookup can return several matches, so select by exact name rather than
  REM    taking the first row, and stop if there is no match.
  curl -s -G "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" ^
    --data-urlencode "q=artificial intelligence" ^
    --data-urlencode "type=technology" > tags.json

  set "TAG_ID="
  for /f "delims=" %A in ('jq -r "[.data[] | select((.name | ascii_downcase) == \"artificial intelligence\") | .id][0] // empty" tags.json') do set TAG_ID=%A
  del tags.json
  if not defined TAG_ID (
    echo Artificial Intelligence tag not found
    exit /b 1
  )

  curl -s -G "https://api.beta.dealroom.app/reference/filters/location/values" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" ^
    --data-urlencode "q=Europe" ^
    --data-urlencode "type=continent" > locations.json

  set "GEO_ID="
  for /f "delims=" %A in ('jq -r "[.data[] | select((.name | ascii_downcase) == \"europe\") | .id][0] // empty" locations.json') do set GEO_ID=%A
  del locations.json
  if not defined GEO_ID (
    echo Europe continent not found
    exit /b 1
  )

  set "MARKET=taxonomy_id[in_any]:%TAG_ID%,hq_location[eq]:%GEO_ID%,is_vc_round[eq]:true"

  REM 3. Size and momentum: capital raised and deal count per year
  echo Year  Rounds  Raised
  curl -s -G "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" ^
    --data-urlencode "metric=count,sum:amount" ^
    --data-urlencode "group_by=year" ^
    --data-urlencode "filter=and(%MARKET%,year[gte]:2021)" ^
    --data-urlencode "sort=dimension" ^
    --data-urlencode "currency=USD" ^
    | jq -r ".data[] | \"\(.dimension)  \(.count)  $\(.sum_amount / 1000000000 * 10 | round / 10)B\""

  REM 4. Deal shape: what a typical round looks like.
  REM    amount[gte]:1 drops rounds with no disclosed amount.
  echo Year  Rounds  p25  Median  p75
  curl -s -G "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" ^
    --data-urlencode "metric=count,p25:amount,median:amount,p75:amount" ^
    --data-urlencode "group_by=year" ^
    --data-urlencode "filter=and(%MARKET%,amount[gte]:1,year[gte]:2021)" ^
    --data-urlencode "sort=dimension" ^
    --data-urlencode "currency=USD" ^
    | jq -r ".data[] | \"\(.dimension)  \(.count)  $\(.p25_amount / 1000000 * 10 | round / 10)M  $\(.median_amount / 1000000 * 10 | round / 10)M  $\(.p75_amount / 1000000 * 10 | round / 10)M\""

  REM 5. Who is deploying into this market
  echo Investor  Rounds  Participated in
  curl -s -G "https://api.beta.dealroom.app/analytics/aggregate/funding-rounds" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" ^
    --data-urlencode "metric=count,sum:amount" ^
    --data-urlencode "group_by=investor_name" ^
    --data-urlencode "filter=and(%MARKET%,year[gte]:2024)" ^
    --data-urlencode "sort=-count" ^
    --data-urlencode "limit=10" ^
    --data-urlencode "currency=USD" ^
    | jq -r ".data[] | \"\(.dimension)  \(.count)  $\(.sum_amount / 1000000 | round)M\""
  ```

  ```powershell PowerShell theme={null}
  # 1. Exchange credentials for a Bearer token
  $body = @{
    client_id     = $env:DEALROOM_CLIENT_ID
    client_secret = $env:DEALROOM_CLIENT_SECRET
    audience      = "https://api.beta.dealroom.app"
    grant_type    = "client_credentials"
  } | ConvertTo-Json

  $accessToken = (Invoke-RestMethod -Method Post `
    -Uri "https://accounts.dealroom.co/oauth/token" `
    -ContentType "application/json" `
    -Body $body).access_token

  $headers = @{
    Authorization = "Bearer $accessToken"
    "X-Client-Id" = $env:DEALROOM_CLIENT_ID
  }

  function Get-Dealroom($Path, $Query) {
    Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app$Path" -Headers $headers -Body $Query
  }

  # 2. Resolve the market definition to IDs. Never hardcode taxonomy IDs.
  #    A lookup can return several matches, so select by exact name rather than
  #    taking the first row, and stop if there is no match.
  $tags = Get-Dealroom "/reference/filters/taxonomy_id/values" @{
    q    = "artificial intelligence"
    type = "technology"
  }
  $tag = $tags.data | Where-Object { $_.name -ieq "artificial intelligence" } | Select-Object -First 1
  if (-not $tag) { throw "Artificial Intelligence tag not found" }

  $locations = Get-Dealroom "/reference/filters/location/values" @{
    q    = "Europe"
    type = "continent"
  }
  $geo = $locations.data | Where-Object { $_.name -ieq "europe" } | Select-Object -First 1
  if (-not $geo) { throw "Europe continent not found" }

  $market = "taxonomy_id[in_any]:$($tag.id),hq_location[eq]:$($geo.id),is_vc_round[eq]:true"

  # 3. Size and momentum: capital raised and deal count per year
  $momentum = Get-Dealroom "/analytics/aggregate/funding-rounds" @{
    metric   = "count,sum:amount"
    group_by = "year"
    filter   = "and($market,year[gte]:2021)"
    sort     = "dimension"
    currency = "USD"
  }
  "Year  Rounds  Raised"
  foreach ($row in $momentum.data) {
    '{0}  {1}  ${2:N1}B' -f $row.dimension, $row.count, ($row.sum_amount / 1e9)
  }

  # 4. Deal shape: what a typical round looks like.
  #    amount[gte]:1 drops rounds with no disclosed amount.
  $shape = Get-Dealroom "/analytics/aggregate/funding-rounds" @{
    metric   = "count,p25:amount,median:amount,p75:amount"
    group_by = "year"
    filter   = "and($market,amount[gte]:1,year[gte]:2021)"
    sort     = "dimension"
    currency = "USD"
  }
  "Year  Rounds  p25  Median  p75"
  foreach ($row in $shape.data) {
    '{0}  {1}  ${2:N1}M  ${3:N1}M  ${4:N1}M' -f $row.dimension, $row.count,
      ($row.p25_amount / 1e6), ($row.median_amount / 1e6), ($row.p75_amount / 1e6)
  }

  # 5. Who is deploying into this market
  $investors = Get-Dealroom "/analytics/aggregate/funding-rounds" @{
    metric   = "count,sum:amount"
    group_by = "investor_name"
    filter   = "and($market,year[gte]:2024)"
    sort     = "-count"
    limit    = 10
    currency = "USD"
  }
  "Investor  Rounds  Participated in"
  foreach ($row in $investors.data) {
    '{0}  {1}  ${2:N0}M' -f $row.dimension, $row.count, ($row.sum_amount / 1e6)
  }
  ```

  ```typescript Node.js theme={null}
  import { ClientCredentials } from "simple-oauth2";

  const CLIENT_ID = process.env.DEALROOM_CLIENT_ID!;
  const CLIENT_SECRET = process.env.DEALROOM_CLIENT_SECRET!;

  const oauth = new ClientCredentials({
    client: { id: CLIENT_ID, secret: CLIENT_SECRET },
    auth: { tokenHost: "https://accounts.dealroom.co", tokenPath: "/oauth/token" },
  });
  const token = await oauth.getToken({ audience: "https://api.beta.dealroom.app" });

  const headers = {
    Authorization: `Bearer ${token.token.access_token}`,
    "X-Client-Id": CLIENT_ID,
  };

  async function get(path: string, params: Record<string, string>) {
    const response = await fetch(
      `https://api.beta.dealroom.app${path}?${new URLSearchParams(params)}`,
      { headers },
    );
    if (!response.ok) throw new Error(`${response.status} on ${path}`);
    return await response.json();
  }

  // A lookup can return several matches, so select by exact name rather than
  // taking the first row, and stop if there is no match.
  function pickByName(rows: Array<{ id: number; name: string }>, name: string) {
    const match = rows.find(row => row.name.toLowerCase() === name.toLowerCase());
    if (!match) throw new Error(`No exact match for "${name}"`);
    return match;
  }

  // Resolve the market definition to IDs. Never hardcode taxonomy IDs.
  const tags = await get("/reference/filters/taxonomy_id/values", {
    q: "artificial intelligence",
    type: "technology",
  });
  const locations = await get("/reference/filters/location/values", {
    q: "Europe",
    type: "continent",
  });

  const tag = pickByName(tags.data, "artificial intelligence");
  const location = pickByName(locations.data, "Europe");

  const market = [
    `taxonomy_id[in_any]:${tag.id}`,
    `hq_location[eq]:${location.id}`,
    "is_vc_round[eq]:true",
  ].join(",");

  const billions = (n: number) => `$${(n / 1e9).toFixed(1)}B`;
  const millions = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

  // Size and momentum: capital raised and deal count per year
  const momentum = await get("/analytics/aggregate/funding-rounds", {
    metric: "count,sum:amount",
    group_by: "year",
    filter: `and(${market},year[gte]:2021)`,
    sort: "dimension",
    currency: "USD",
  });
  console.log("\nYear  Rounds  Raised");
  for (const row of momentum.data) {
    console.log(`${row.dimension}  ${row.count}  ${billions(row.sum_amount)}`);
  }

  // Deal shape: what a typical round looks like.
  // amount[gte]:1 drops rounds with no disclosed amount.
  const shape = await get("/analytics/aggregate/funding-rounds", {
    metric: "count,p25:amount,median:amount,p75:amount",
    group_by: "year",
    filter: `and(${market},amount[gte]:1,year[gte]:2021)`,
    sort: "dimension",
    currency: "USD",
  });
  console.log("\nYear  Rounds  p25  Median  p75");
  for (const row of shape.data) {
    console.log(
      `${row.dimension}  ${row.count}  ${millions(row.p25_amount)}  ` +
        `${millions(row.median_amount)}  ${millions(row.p75_amount)}`,
    );
  }

  // Who is deploying into this market
  const investors = await get("/analytics/aggregate/funding-rounds", {
    metric: "count,sum:amount",
    group_by: "investor_name",
    filter: `and(${market},year[gte]:2024)`,
    sort: "-count",
    limit: "10",
    currency: "USD",
  });
  console.log("\nInvestor  Rounds  Participated in");
  for (const row of investors.data) {
    console.log(`${row.dimension}  ${row.count}  ${millions(row.sum_amount)}`);
  }
  ```

  ```python Python theme={null}
  import os
  from authlib.integrations.requests_client import OAuth2Session

  CLIENT_ID = os.environ["DEALROOM_CLIENT_ID"]
  CLIENT_SECRET = os.environ["DEALROOM_CLIENT_SECRET"]

  session = OAuth2Session(client_id=CLIENT_ID, client_secret=CLIENT_SECRET)
  session.headers.update({"X-Client-Id": CLIENT_ID})
  session.fetch_token(
      url="https://accounts.dealroom.co/oauth/token",
      grant_type="client_credentials",
      audience="https://api.beta.dealroom.app",
  )

  BASE = "https://api.beta.dealroom.app"
  AGGREGATE = f"{BASE}/analytics/aggregate/funding-rounds"


  def get(path, **params):
      response = session.get(path, params=params)
      response.raise_for_status()
      return response.json()


  # A lookup can return several matches, so select by exact name rather than
  # taking the first row, and stop if there is no match.
  def pick_by_name(rows, name):
      for row in rows:
          if row["name"].lower() == name.lower():
              return row
      raise LookupError(f'No exact match for "{name}"')


  # Resolve the market definition to IDs. Never hardcode taxonomy IDs.
  tags = get(
      f"{BASE}/reference/filters/taxonomy_id/values",
      q="artificial intelligence",
      type="technology",
  )
  locations = get(
      f"{BASE}/reference/filters/location/values",
      q="Europe",
      type="continent",
  )

  tag = pick_by_name(tags["data"], "artificial intelligence")
  location = pick_by_name(locations["data"], "Europe")

  market = ",".join([
      f"taxonomy_id[in_any]:{tag['id']}",
      f"hq_location[eq]:{location['id']}",
      "is_vc_round[eq]:true",
  ])

  # Size and momentum: capital raised and deal count per year
  momentum = get(
      AGGREGATE,
      metric="count,sum:amount",
      group_by="year",
      filter=f"and({market},year[gte]:2021)",
      sort="dimension",
      currency="USD",
  )
  print("\nYear  Rounds  Raised")
  for row in momentum["data"]:
      print(f"{row['dimension']}  {row['count']}  ${row['sum_amount'] / 1e9:.1f}B")

  # Deal shape: what a typical round looks like.
  # amount[gte]:1 drops rounds with no disclosed amount.
  shape = get(
      AGGREGATE,
      metric="count,p25:amount,median:amount,p75:amount",
      group_by="year",
      filter=f"and({market},amount[gte]:1,year[gte]:2021)",
      sort="dimension",
      currency="USD",
  )
  print("\nYear  Rounds  p25  Median  p75")
  for row in shape["data"]:
      print(
          f"{row['dimension']}  {row['count']}  ${row['p25_amount'] / 1e6:.1f}M  "
          f"${row['median_amount'] / 1e6:.1f}M  ${row['p75_amount'] / 1e6:.1f}M"
      )

  # Who is deploying into this market
  investors = get(
      AGGREGATE,
      metric="count,sum:amount",
      group_by="investor_name",
      filter=f"and({market},year[gte]:2024)",
      sort="-count",
      limit=10,
      currency="USD",
  )
  print("\nInvestor  Rounds  Participated in")
  for row in investors["data"]:
      print(f"{row['dimension']}  {row['count']}  ${row['sum_amount'] / 1e6:.0f}M")
  ```
</CodeGroup>

## How the requests fit together

Every request after the lookups reuses one filter fragment, `MARKET`, which is
the market definition: a technology tag, a location, and `is_vc_round[eq]:true`
to exclude grants, debt, and other non-venture events. Holding that fragment
constant is what makes the results comparable.

| Step | What it measures | Key parameters |
| - | - | - |
| 2 | The market definition, as taxonomy IDs | `q`, `type` |
| 3 | Capital and deal count over time | `metric=count,sum:amount`, `group_by=year` |
| 4 | The distribution of round sizes over time | `metric=count,p25:amount,median:amount,p75:amount` |
| 5 | The most active investors in the market | `metric=count,sum:amount`, `group_by=investor_name` |

Steps 3 and 4 are the pair that carries the analysis. Step 3 tells you whether
money is flowing in. Step 4 tells you whether it is spread across more
companies or concentrated into larger rounds. Reading them together is what separates a
growing market from a concentrating one.

## Common pitfalls

* **Reporting lag.** Rounds keep being recorded for weeks after they close, so
  the most recent period always understates. Exclude the current year from a
  trend, or label it as partial.
* **Undisclosed amounts.** `amount[gte]:1` in step 4 excludes rounds with no
  reported amount, which is why its `count` is lower than step 3's. Leave the
  filter out and those rounds enter the distribution as zeroes.
* **Investor amounts double count.** A round contributes its full size to every
  investor in it, so step 5's amounts rank investors but should not be totalled.
  Deal count also favours investors who write many small cheques, so use
  `sort=-sum_amount` when you want capital deployed instead.
* **Small groups.** Narrow the market far enough and a percentile is drawn from
  a handful of rounds. Check `count` before reading a median.

## Where to go from here

* Break the same market down by geography instead of time with
  `group_by=hq_country`, or by stage with `group_by=standardized_round`. The
  filter fragment stays identical. See
  [Analytics and aggregates](/concepts/aggregates) for every supported source,
  metric, and dimension.
* Add per-metric filters and percentages with
  `/analytics/aggregate/{source}/multi-metric`, which can calculate shares such
  as "what proportion of this market is unicorns" in one request.
* Request every monetary metric and threshold in another currency with
  `currency=EUR`. See [Currencies](/concepts/currencies).
* Move from the aggregate to the underlying records with `/data/transactions`,
  using the same filter syntax. See [Filtering](/concepts/filtering) and the
  [Filters and sorting reference](/references/filters-and-sorting).
* For a shorter first query against a `/data` endpoint, see
  [Top fintech startups](/examples/top-startups).
