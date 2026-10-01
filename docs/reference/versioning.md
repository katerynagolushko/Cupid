> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# API versioning

> Learn how the Dealroom API uses Stripe-style date-based versioning to handle breaking changes while keeping existing integrations stable.

The Dealroom API uses **date-based versioning** (Stripe-style). Every breaking change is
assigned a calendar date. Clients pin a version; the API downgrades responses and upgrades
requests automatically so your integration keeps working without immediate code changes.

## Specifying a version

Send the `API-Version` header with a `YYYY-MM-DD` date:

<CodeGroup>
  ```bash cURL theme={null}
  curl "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=1" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "API-Version: 2026-03-16" \
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```batch Windows CMD theme={null}
  curl "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=1" ^
    -H "Authorization: Bearer %ACCESS_TOKEN%" ^
    -H "API-Version: 2026-03-16" ^
    -H "X-Client-Id: YOUR_CLIENT_ID"
  ```

  ```powershell PowerShell theme={null}
  $headers = @{
    Authorization = "Bearer $accessToken"
    "API-Version" = "2026-03-16"
    "X-Client-Id" = "YOUR_CLIENT_ID"
  }

  Invoke-RestMethod -Uri "https://api.beta.dealroom.app/data/entities?sort=-launch_date&limit=1" -Headers $headers
  ```
</CodeGroup>

If omitted, the **latest version** is used automatically.

## Response headers

Every response includes version metadata:

| Header | Description | Example |
| - | - | - |
| `API-Version` | The version applied to this request | `2026-03-16` |
| `Deprecation` | Date the version was deprecated (if applicable) | `2026-09-01` |
| `Sunset` | Date the version will stop working (if applicable) | `2026-10-01` |

`Deprecation` and `Sunset` only appear when you're on an older version than the latest.
`Sunset` is a fixed calendar date — 30 days after the version that superseded yours — not a
countdown that starts when you first see the header. Read the date off the header rather than
assuming 30 days remain: if your integration has been quiet, some of the window is already spent.

The Dealroom API is in **open beta** and under active development. A pinned version is supported
for **30 days** past the date it is superseded. This 30-day window holds for the whole beta. We
intend to widen it to 90 days at general availability — until then, 30 days is the window.

## How a breaking change reaches you

Every breaking change is recorded on the [Changelog](/changelog) tab, published with the release
that ships it. You don't have to watch that page: as soon as a newer version supersedes the one
you have pinned, every response carries `Deprecation` and `Sunset` headers, and your pinned
version keeps working until the `Sunset` date those headers carry — 30 days after the
supersession, not 30 days after you noticed.

## Current versions

See the [Changelog](/changelog) tab for the full list of API versions, their status
(current or deprecated), and migration notes for each release. There is no third status for a
retired version. Retirement happens when the minimum supported version advances past it, at
which point requests pinned to it return [`400`](#version-no-longer-supported). Treat the
`Sunset` date as the commitment — we may retire a version any time after it, so migrate by that
date rather than waiting to be cut off.

## Pinning a version

Pin a version by sending the `API-Version` header on each request (see
[Specifying a version](#specifying-a-version) above). Omit it to use the latest version.

## Error responses

### Invalid format

```json theme={null}
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid API-Version header: \"bad-date\". Expected format: YYYY-MM-DD"
  }
}
```

### Version no longer supported

```json theme={null}
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "API version \"2020-01-01\" is no longer supported. Minimum supported version is 2026-03-16"
  }
}
```

## Migration guide

When a new version is released:

1. Check the changelog (below) to understand what changed.
2. Update your integration to use the new field names, params, or error handling.
3. Test against the new version by sending `API-Version: <new-date>` in requests.
4. Update your pinned version once you're confident the migration is complete.

Migrate by the `Sunset` date on your responses. That date is 30 days after your version was
superseded — not 30 days from when you first noticed the headers.

## Changelog

See the full [Changelog](/changelog) tab for all version changes, migration guides, and affected endpoints.
