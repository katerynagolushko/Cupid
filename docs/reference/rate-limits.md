> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Rate limits

> How the Dealroom API rate-limits requests, what a 429 response looks like, and how to raise your limit.

Rate limiting is one of several independent controls that protect the API. It caps how *fast* you
can call the API — a latency and cost safeguard that stops one caller degrading the service for
everyone and bounds the blast radius of a runaway or leaked key. It does **not** cap how *much* data
you can extract in total; that is the job of the [pagination depth cap](/concepts/pagination).

Two layers enforce it, split by what each layer can distinguish:

* **Cloudflare edge** — per-IP limits on anonymous, unauthenticated traffic, applied before the
  request reaches the API.
* **In-API per-key floor** — a per-API-key limit of **5 requests per second by default**, applied to
  requests authenticated with an API key. The floor is overridable per key; paid plans can raise it.

<Note>
  The two layers stack. The edge bounds anonymous bursts by IP; the in-API floor
  bounds a single API key regardless of source IP, because the edge sees a token
  but cannot resolve it to a key or plan. Only API-key (machine-to-machine)
  requests are subject to the per-key floor — interactive, logged-in app
  sessions are not.
</Note>

## When you exceed the limit

The API returns **`429 Too Many Requests`**. Which layer rejected the request determines the body:

* **In-API floor** (per key) — the standard [error envelope](/concepts/errors), with the stable
  `RATE_LIMITED` code:

  ```json theme={null}
  {
    "error": {
      "code": "RATE_LIMITED",
      "message": "Too many requests"
    }
  }
  ```

* **Cloudflare edge** (per IP) — a Cloudflare-generated payload, not the API error envelope, because
  the request never reaches the API server.

Detect rate limiting by **HTTP status code**, not by body shape — that works for both layers:

```typescript theme={null}
if (response.status === 429) {
  // Rate limited — back off and retry
}
```

## Response headers

A `429` carries a **`Retry-After`** header — the number of seconds to wait before retrying. Honor it.

| Header | Description |
| - | - |
| `Retry-After` | Seconds to wait before retrying — present on `429` responses |

Both `Retry-After` and the consumption header `X-Credits-Used` are exposed to browser clients via
`Access-Control-Expose-Headers`. Rate limiting caps how *fast* you call; what each call *consumed* is
a separate axis — see [Credits](/concepts/credits).

<Note>
  The API does **not** emit `X-RateLimit-Limit`, `X-RateLimit-Remaining`, or
  `X-RateLimit-Reset` headers. The per-key limiter runs independently on each
  API replica with no shared counter, so a precise remaining-budget cannot be
  reported. Pace requests against your known floor and treat a `429` as the
  authoritative signal.
</Note>

## Handling 429 in your client

Use exponential backoff. If `Retry-After` is present, honor it instead of a fixed delay.

```typescript theme={null}
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err.response?.status !== 429 || attempt === maxAttempts) throw err;
      const retryAfter = Number(err.response.headers["retry-after"]);
      const delayMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : Math.min(2 ** attempt * 1000, 30000);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}
```

## Best practices

* **Batch where possible.** Use [aggregate endpoints](/concepts/aggregates)
  instead of fetching individual entities to compute totals.
* **Cache responses.** Most reference data (taxonomy, dimensions) changes rarely —
  cache for the lifetime of your app's request cycle.
* **Use one API key per integration.** Sharing a key across services makes the per-key floor harder
  to reason about — every service draws from the same budget.
* **Coalesce parallel calls.** If your dashboard fires 8 parallel aggregate calls per
  page load, that's 8 against the floor. Fan-out is fine; storms aren't.

## Requesting a higher limit

If your workload needs sustained higher throughput (data pipelines, periodic exports,
research workloads), contact your Dealroom account manager to raise your key's floor. Include:

* The use case and expected request volume (peak and sustained requests per second)
* Which endpoints will see the most traffic
* Whether the work can run off-peak

Programmatic data exports are usually better served by the aggregate endpoints or a
custom bulk-export arrangement than by raising raw request limits.

## Further reading

<CardGroup cols={2}>
  <Card title="Pagination" icon="list-ol" href="/concepts/pagination">
    Walk large result sets efficiently and understand depth limits.
  </Card>

  <Card title="Analytics and aggregates" icon="chart-bar" href="/concepts/aggregates">
    Compute totals and grouped results without downloading every record.
  </Card>
</CardGroup>
