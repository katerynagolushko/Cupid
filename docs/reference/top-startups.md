> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Top fintech startups

> Fetch the 10 most-funded fintech startups through the Dealroom API in cURL, Windows CMD, PowerShell, Node.js, or Python.

The shortest end-to-end query you can run against the Dealroom API. It
authenticates with your API key, fetches the 10 most-funded companies tagged
`fintech`, and prints them.

Adapt it by swapping the industry, sort key, or limit. The same primitives
apply across the API.

The Dealroom API filters industries by numeric tag ID. Each example first looks
up the current ID for `Fintech`, then uses it to query Dealroom-classified
startups through `/data/companies`.

<Note>
  To reuse this recipe for another industry, change the value of `q` in the
  `/reference/filters/taxonomy_id/values` request. The response includes the accepted
  numeric IDs.

  <CodeGroup>
    ```bash cURL theme={null}
    curl -sS "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "X-Client-Id: $DEALROOM_CLIENT_ID" | jq .
    ```

    ```batch Windows CMD theme={null}
    curl -sS "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry" ^
      -H "Authorization: Bearer %ACCESS_TOKEN%" ^
      -H "X-Client-Id: %DEALROOM_CLIENT_ID%" | jq .
    ```

    ```powershell PowerShell theme={null}
    $headers = @{
      Authorization = "Bearer $accessToken"
      "X-Client-Id" = $env:DEALROOM_CLIENT_ID
    }

    Invoke-RestMethod -Uri "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry" -Headers $headers |
      ConvertTo-Json -Depth 10
    ```
  </CodeGroup>
</Note>

## Prerequisites

* Complete the [Quickstart](/getting-started/quickstart) to create an API key
  and make your first request.
* `DEALROOM_CLIENT_ID` and `DEALROOM_CLIENT_SECRET` exported as environment variables.
* [`jq`](https://jqlang.github.io/jq/) for the cURL and Command Prompt snippets (token
  extraction and output formatting). The PowerShell, Node.js, and Python variants don't
  require it.

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

  # 2. Look up the Fintech industry tag ID
  FINTECH_TAG_ID=$(curl -s "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: $DEALROOM_CLIENT_ID" \
    | jq -r '.data[] | select((.name | ascii_downcase) == "fintech") | .id' \
    | head -n 1)
  test -n "$FINTECH_TAG_ID" || { echo "Fintech industry tag not found" >&2; exit 1; }

  # 3. Fetch and print the top 10
  curl -s -g "https://api.beta.dealroom.app/data/companies?filter=and(taxonomy_id[in_any]:$FINTECH_TAG_ID,classification[in_any]:startup)&sort=-total_funding&limit=10" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Client-Id: $DEALROOM_CLIENT_ID" \
    | jq -r '.data[] | "\(.name) — $\(.funding_summary.total_funding // 0)"'
  ```

  ```batch Windows CMD theme={null}
  REM 1. Exchange credentials for a Bearer token
  curl -s -X POST "https://accounts.dealroom.co/oauth/token" ^
    -H "Content-Type: application/json" ^
    -d "{\"client_id\": \"%DEALROOM_CLIENT_ID%\", \"client_secret\": \"%DEALROOM_CLIENT_SECRET%\", \"audience\": \"https://api.beta.dealroom.app\", \"grant_type\": \"client_credentials\"}" > token.json
  for /f "delims=" %A in ('jq -r .access_token token.json') do set ACCESS_TOKEN=%A
  del token.json

  REM 2. Look up the Fintech industry tag ID. The [0] takes the first match.
  curl -s "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" > tags.json

  set "FINTECH_TAG_ID="
  for /f "delims=" %A in ('jq -r "[.data[] | select((.name | ascii_downcase) == \"fintech\") | .id][0] // empty" tags.json') do set FINTECH_TAG_ID=%A
  del tags.json
  if not defined FINTECH_TAG_ID (
    echo Fintech industry tag not found
    exit /b 1
  )

  REM 3. Fetch and print the top 10
  curl -s -g "https://api.beta.dealroom.app/data/companies?filter=and(taxonomy_id[in_any]:%FINTECH_TAG_ID%,classification[in_any]:startup)&sort=-total_funding&limit=10" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "X-Client-Id: %DEALROOM_CLIENT_ID%" ^
    | jq -r ".data[] | \"\(.name) — $\(.funding_summary.total_funding // 0)\""
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

  # 2. Look up the Fintech industry tag ID
  $tags = Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values" -Headers $headers -Body @{
    q    = "fintech"
    type = "industry"
  }

  $fintech = $tags.data | Where-Object { $_.name -ieq "fintech" } | Select-Object -First 1
  if (-not $fintech) { throw "Fintech industry tag not found" }

  # 3. Fetch and print the top 10
  $companies = Invoke-RestMethod -Method Get -Uri "https://api.beta.dealroom.app/data/companies" -Headers $headers -Body @{
    filter = "and(taxonomy_id[in_any]:$($fintech.id),classification[in_any]:startup)"
    sort   = "-total_funding"
    limit  = 10
  }

  foreach ($company in $companies.data) {
    $funding = [double]$company.funding_summary.total_funding
    '{0} — ${1:N0}' -f $company.name, $funding
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

  const tagResponse = await fetch(
    "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values?q=fintech&type=industry",
    { headers },
  );
  const tagData: { data: Array<{ id: number; name: string }> } =
    await tagResponse.json();
  const fintech = tagData.data.find(tag => tag.name.toLowerCase() === "fintech");
  if (!fintech) throw new Error("Fintech industry tag not found");

  const params = new URLSearchParams({
    filter: `and(taxonomy_id[in_any]:${fintech.id},classification[in_any]:startup)`,
    sort: "-total_funding",
    limit: "10",
  });

  const response = await fetch(`https://api.beta.dealroom.app/data/companies?${params}`, {
    headers,
  });
  const { data } = await response.json();

  for (const company of data) {
    const funding = Number(company.funding_summary?.total_funding ?? 0);
    console.log(`${company.name} — $${funding.toLocaleString()}`);
  }
  ```

  ```python Python theme={null}
  import os
  from authlib.integrations.requests_client import OAuth2Session

  CLIENT_ID = os.environ["DEALROOM_CLIENT_ID"]
  CLIENT_SECRET = os.environ["DEALROOM_CLIENT_SECRET"]

  session = OAuth2Session(client_id=CLIENT_ID, client_secret=CLIENT_SECRET)
  session.headers.update({
      "X-Client-Id": CLIENT_ID,
  })
  session.fetch_token(
      url="https://accounts.dealroom.co/oauth/token",
      grant_type="client_credentials",
      audience="https://api.beta.dealroom.app",
  )

  tag_response = session.get(
      "https://api.beta.dealroom.app/reference/filters/taxonomy_id/values",
      params={"q": "fintech", "type": "industry"},
  )
  fintech = next(
      value
      for value in tag_response.json()["data"]
      if value["name"].lower() == "fintech"
  )

  response = session.get(
      "https://api.beta.dealroom.app/data/companies",
      params={
          "filter": f"and(taxonomy_id[in_any]:{fintech['id']},classification[in_any]:startup)",
          "sort": "-total_funding",
          "limit": 10,
      },
  )

  for company in response.json()["data"]:
      summary = company.get("funding_summary") or {}
      funding = float(summary.get("total_funding") or 0)
      print(f"{company['name']} — ${funding:,.0f}")
  ```
</CodeGroup>

## Where to go from here

* Swap the tag ID for any other industry — use `/reference/filters/taxonomy_id/values?type=industry` to discover tag IDs. See the [Filters reference](/references/filters-and-sorting) for the full operator list.
* Combine filters with `and()` / `or()` — see [Filtering](/concepts/filtering).
* Compute totals or rankings server-side instead of paging — see [Aggregates](/concepts/aggregates).
