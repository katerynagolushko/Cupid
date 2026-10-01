> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Agent setup guide

> Instructions for an AI coding agent setting up the Dealroom API on a user's machine, from creating an API key to a first verified request.

<Note>
  This page is written for an AI coding agent, not for a person. If you are
  setting things up yourself, read the [Quickstart](/getting-started/quickstart)
  instead.
</Note>

## Your job

Get the user from no API key to one working request, with the least machinery
possible.

Build exactly three things, all in the project folder:

* One script. If the user asks for a language, use it. Otherwise match the
  machine: PowerShell on Windows, the default shell elsewhere. One client, not
  two.
* A copy of the `.env` file they download from Dealroom.
* A short `README.md` so a new chat can pick the work up. See
  [Leave the folder ready to pick up](#leave-the-folder-ready-to-pick-up).

Hold to these limits:

* Use the standard library. Install no dependencies.
* Create no project scaffold, no framework, no package manifest, no tests.
* Write no second client, no wrapper layer, no abstraction over the requests.
* If the user wants more once this works, add it then.

## Getting credentials

Do this before you write any code.

<Steps>
  <Step title="Send the user to the API keys page">
    Point them at the API keys page:

    ```text theme={null}
    https://beta.dealroom.app/settings/api
    ```

    Tell them to select **Create key**, give it a name, and pick the scopes
    their task needs. Scopes cannot be changed later.
  </Step>

  <Step title="Have them download the credentials">
    On the dialog that shows the new key, tell them to select **Download as
    .env**. The secret is shown once and cannot be retrieved afterwards.
  </Step>

  <Step title="Ask for the file path">
    Ask where the file was saved. Ask for the path, never for the values.
  </Step>

  <Step title="Copy it into the project folder">
    Copy the file into the project folder as `.env`, byte for byte: `cp` or
    `Copy-Item`, never a read-and-write that could re-encode it. Leave the
    download where it is. Read `DEALROOM_CLIENT_ID` and `DEALROOM_CLIENT_SECRET`
    from the copy, and have your script load it from there.
  </Step>
</Steps>

Never ask the user to paste the client secret into the chat. Never print it,
log it, or put it in a command you show them. Copy the `.env` file, never
rewrite, reformat, or re-encode it. If the folder is a git repository, or
becomes one, add `.env` to `.gitignore` before anything is committed.

If the API keys page shows a waitlist instead of a create-key form, the account
cannot create keys yet. Say so and stop.

## Token exchange

The credentials are not the token. Exchange them for a short-lived Bearer token
using the OAuth2 client credentials grant, then send that token on every
request.

```bash theme={null}
curl -sS -X POST "https://accounts.dealroom.co/oauth/token" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"$DEALROOM_CLIENT_ID\",
    \"client_secret\": \"$DEALROOM_CLIENT_SECRET\",
    \"audience\": \"https://api.beta.dealroom.app\",
    \"grant_type\": \"client_credentials\"
  }"
```

Translate that request into whatever language you are writing. The shape does
not change. These examples deliberately omit cURL's `-f`: on a `4xx` you want
the response body, because it names the problem.

* The `audience` is `https://api.beta.dealroom.app`. It is an OAuth2 identifier, not a host
  you call, and it differs from the API base URL `https://api.beta.dealroom.app` on purpose.
  Send both values exactly as configured.
* The response carries `access_token`, `token_type`, and `expires_in`. Cache
  the token and reuse it until shortly before `expires_in` elapses. Do not
  request a new token per call.
* On a `401`, refresh the token once and retry. If the retry fails too, the
  key was probably revoked. Stop and tell the user to check it in the dashboard.

Send three headers on every API request:

| Header | Value |
| - | - |
| `Authorization` | `Bearer` followed by the access token |
| `X-Client-Id` | the `client_id` from the `.env` |
| `User-Agent` | an explicit name for your script, such as `my-app/1.0` |

Set `User-Agent` yourself. Cloudflare sits in front of the API and blocks some
standard-library defaults, notably Python's `urllib`, before the request
reaches the API. The reply is then HTML, not JSON.

A missing or mismatched `X-Client-Id` returns `400`, not `401`. When a `400`
names a header, do not go hunting for a token problem.

## Verify

Run this request:

```bash theme={null}
curl -sSg "https://api.beta.dealroom.app/data/companies?sort=-latest_valuation&limit=10&include_total=true&filter=and(classification[in_any]:vc_backed,launch_date[gte]:2020)" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Client-Id: $DEALROOM_CLIENT_ID" \
  -H "User-Agent: my-app/1.0"
```

Show the ten results to the user as a table with four columns: `name`,
`hq_country`, `launch_year`, and `latest_valuation.value`.

The table is the success condition. Reporting "setup complete" without showing
it is not done. If the request fails, fix it and run it again before you report
anything.

cURL needs `-g` here because it treats `[` and `]` as glob ranges even inside a
quoted URL. Other HTTP clients need no equivalent option.

## Things you would otherwise guess

* **Records are keyed by `uuid`.** Entity records carry no `id` field. `id`
  exists only as a filter key.
* **The cursor changes name between response and request.** The response field
  is `page.next_cursor`; the request parameter is `cursor`. Send
  `next_cursor=` and the API ignores it and returns page one again, with no
  error. Every loop written that way runs forever on the same page.
* **Discover filters, do not guess them.** A `GET` on
  `https://api.beta.dealroom.app/reference/filters?scope=companies` returns the authoritative
  inventory for that scope, with operators and value types. The parameter is
  `scope`.
* **Money fields are objects, not numbers.** `latest_valuation` has `.value`,
  `.year`, and `.month`. Formatting the object itself prints nothing useful.
* **Read `4xx` bodies.** They name the missing parameter and list the accepted
  values, so the fix is usually already in the response you have.
* **On Windows, the default shell is Windows PowerShell 5.1.** When the user
  has not asked for a language, write the script in PowerShell with
  `Invoke-RestMethod`, which parses JSON itself, so there is no `jq`. If you run
  cURL directly, call `curl.exe`: bare `curl` there is an alias for
  `Invoke-WebRequest` and rejects cURL arguments. The
  [Quickstart](/getting-started/quickstart) Windows PowerShell tab is the
  reference translation of the requests on this page.
* **Windows PowerShell 5.1 writes a BOM** when you pass `-Encoding utf8`, and
  the next shell to read that file sees a stray prefix on the first key. Prefer
  not to write files another shell will read. If you must, use
  `[IO.File]::WriteAllText` or PowerShell 7's `utf8NoBOM`. Never rewrite the
  user's `.env`.

## Leave the folder ready to pick up

The user will come back in a new chat with no memory of this one. Before you
report success, write a `README.md` of ten lines or fewer, containing:

* What the script does and the exact command to run it.
* Where the credentials are (`.env` in this folder) and that the client secret
  must never be committed or pasted anywhere.
* That tokens last 24 hours and the script fetches a fresh one when needed.
* Links to this page and to `https://developers.beta.dealroom.co/llms.txt`.
* One line the user can paste into a new chat to continue: "Read README.md in
  this folder and continue from there."

Mention the README in your closing message so the user knows it exists.

## How to talk to the user

* Report outcomes, not mechanics. "Your key works, here are the ten companies"
  beats a walkthrough of the token exchange.
* Do not explain OAuth unless they ask.
* On failure, say what to do next: create a new key, add a scope, check the
  file path. Say what to do, not why it broke.
* Ask one question at a time, and only when you cannot continue without the
  answer.

## Where to look next

* `https://developers.beta.dealroom.co/llms.txt` first. It is the complete page index in a single
  fetch, so you get the real page list instead of a guessed URL.
* [Filtering](/concepts/filtering) for the filter syntax, operators, and
  taxonomy value lookup.
* [Pagination](/concepts/pagination) before you walk past the first page.
* The [Quickstart](/getting-started/quickstart) Node.js and Python tabs: a
  complete single-file script each, standard library only, that reads the
  `.env`, exchanges the token, and runs the verification request. Start from
  the one in the user's language instead of writing your own.
* [Token caching and refresh](/getting-started/authentication#token-caching-and-refresh):
  Node.js and Python helpers that cache the token by `expires_in` and refresh
  once on `401`. Use one when the script will run longer than a session.
* [Top fintech startups](/examples/top-startups) for a complete worked query.
* `https://developers.beta.dealroom.co/openapi.yaml` for the exact parameters and response schema of
  every endpoint.

Discover, do not guess. When you are about to invent a field name, a filter
key, or an endpoint path, fetch one of the above instead.
