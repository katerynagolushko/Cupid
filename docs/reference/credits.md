> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Credits

> How to read what each API call consumed from the X-Credits-Used response header, and what it does — and does not — mean during open beta.

Every response to an API-key request under `/data`, `/analytics` and `/reference` carries an
**`X-Credits-Used`** header: the number of credits that request consumed. Credits are the unit the
API meters usage in, independent of any currency or plan — the same call costs the same number of
credits whoever makes it, and re-pricing changes the schedule, not the header format.

<Note>
  **Open beta: reported, not charged.** During the observation window the header
  tells you what a call consumed so you can see and tune your integration's
  usage. Nothing is deducted from an allowance and no request is rejected for
  consumption. Allowances and enforcement follow after the window closes; the
  header is how you get ready for them.
</Note>

## Reading the header

```http theme={null}
GET /data/transactions?limit=25
HTTP/1.1 200 OK
X-Credits-Used: 25

GET /data/companies/{id}
HTTP/1.1 200 OK
X-Credits-Used: 2

GET /analytics/aggregate/funding-rounds?…
HTTP/1.1 200 OK
X-Credits-Used: 5

GET /reference/filters/taxonomy_id/values?q=fintech
HTTP/1.1 200 OK
X-Credits-Used: 0

GET /data/companies?limit=25&offset=999999
HTTP/1.1 400 Bad Request
X-Credits-Used: 0
```

The value is always a non-negative integer.

| Value | Meaning |
| - | - |
| `N > 0` | This request consumed `N` credits |
| `0` | A free endpoint (search, filter values, lookups) **or** an error response — a failed call costs nothing |
| header absent | The endpoint is not metered, or the request was not authenticated with an API key |

`0` and *absent* are deliberately different: `0` means the API metered the call and found it free;
absent means it was never metered.

## What a call costs

Cost follows from what the call returns, not from which endpoint you hit:

| Call | Credits |
| - | - |
| Funding rounds, valuations, news, notes, jobs — list, detail or sub-resource (`/data/transactions`, `/data/valuations`, `/data/news`, `/data/notes`, `/data/jobs`, `/data/companies/{id}/funding-rounds`, …) | 1 per record |
| Map points (`/data/*/geo`) | 1 per point |
| Every other `/data` collection — `entities`, `companies`, `investors`, `people`, `founders`, `universities`, `gov-ngo`, `funds` — as list, detail or sub-resource (`/data/companies`, `/data/investors/{id}/portfolio`, `/data/companies/{id}/team`, …) | 2 per record |
| Aggregates, timeseries, funding analytics (`/analytics/*`) | 5 per query, whatever it scans |
| Search, filter values, reference lookups (`/data/search`, `/reference/*`) | 0 |

A `GET /data/companies?limit=25` therefore reports `50`: every company row is a full profile.
Add `view=summary` on an entity collection (`entities`, `companies`, `universities`, `gov-ngo`,
`investors`, `people`, `founders`) for summary rows, priced at 1 per record: the same rows without
their full-only blocks, so `GET /data/companies?limit=25&view=summary` reports `25`. The response
echoes the view it served as `view`.

<Warning>
  The prices are **placeholders** for the observation window and will be revised
  before anything is charged. Build against the header, not against the
  numbers on this page.
</Warning>

## Which responses carry it

* **Carried**: every response — success or error — to a request authenticated with an API key
  under `/data/*`, `/analytics/*` and `/reference/*`, including `403`, `404`, `429` and any `400`
  raised once authentication has completed.
* **Not carried**: `/platform/*` self-service (account, API keys, usage, teams, lists), `/system/*`,
  `/health`, the API reference itself, the namespace indices (`/data`, `/analytics`, `/reference`),
  and any response rejected before authentication completes — a `401` for a missing or invalid
  token, or the `400` for an API-key request without its `X-Client-Id` header.

The header is listed in `Access-Control-Expose-Headers`, so browser-side code can read it:

```typescript theme={null}
const res = await fetch(`${baseUrl}/data/transactions?limit=25`, { headers });
const raw = res.headers.get("X-Credits-Used");
// null: not metered (or not an API-key request) — keep it distinct from a free call's 0
const credits = raw === null ? null : Number(raw);
```

## Remaining balance

During open beta an API key draws on its **team's credits**, granted by Dealroom when you get API
access. Your team's used and remaining credits are shown on the API keys settings page. When they
are used up, or if none were granted yet, requests under `/data` and `/analytics` return
`402 CREDITS_EXHAUSTED` until more are added; `/reference` lookups are free and stay available. The
balance trails usage by up to about two minutes, so a few requests past the limit can still succeed.
If your team's credits cannot be checked for a moment, requests return `503 SERVICE_UNAVAILABLE`;
retry shortly.

There is no `X-Credits-Remaining` header yet. The API only reports a figure it can compute exactly
on every replica, and a remaining balance needs a shared consumption counter that does not exist yet.

## Further reading

<CardGroup cols={2}>
  <Card title="Rate limits" icon="gauge-high" href="/concepts/rate-limits">
    How fast you can call the API — a separate control from how much you consume.
  </Card>

  <Card title="Errors" icon="triangle-exclamation" href="/concepts/errors">
    The error envelope and every stable error code, including the reserved 402.
  </Card>
</CardGroup>
