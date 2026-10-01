# Angel Doors

Find strategic angels who don't just write a cheque but open doors to your next customer. Built at the [Dealroom API Hackathon](https://luma.com/u3mhdld7) (1 Oct 2026, Phoenix Court, London).

- **Run:** `node server.mjs`, then open [http://localhost:3000](http://localhost:3000). Node 18+, no installs, start it from this folder.
- **Journey:** dictate (Wispr Flow) what you build, your stage and the angel you want → gpt-6-luna turns it into filters (keyword parser fallback) → ranked angels from the Dealroom graph → open one → warm intro paths → drafted intro ask to the connector, plus a drafted message to the angel.
- **Demo link:** `http://localhost:3000/?ask=<text>&me=<your name>&open=<angel name>` pre-runs a query.
- **Credentials:** Dealroom in `.env`, OpenAI in `.openai.env` (both gitignored, server-side only).
- The old "Cross the Pond" app is still at `/index.html`.

## How it uses the graph

| Step | Endpoint |
|---|---|
| Active angels in your industry and region | `/data/investors` with `investor_type=angel`, `hq_location`, `investor_experience_id`, `last_investor_round_date` |
| Their careers (employer, advisor, board, founder) | `/data/people/{id}/career` → company `unicorn_type`, industry, headcount |
| Evidence: deals in your industry | `/data/investors/{id}/portfolio?filter=taxonomy_id` |
| Inner circle (people closest to the angel) | `/data/companies/{id}/team` for the angel's companies |
| Your overlap with the angel | `/data/search` → your `/people/{id}/career` → shared companies and shared colleagues |

Score out of 100: background you asked for (FAANG, enterprise, unicorn) 25 · doors into your customer industry 25 · advisor seats 15 · deals in your industry 15 · stage fit 10 · recency 10.

## Gotchas

- LinkedIn mutual connections aren't available through any public API. Warm paths come from Dealroom's people graph (shared employers, co-workers).
- `/data/investors` timed out (500 after 15s) under hackathon load at around 6pm. Results are cached in `cache/angels/` (48h) and the cache is used as a fallback. Pre-cached: Health, Fintech, Enterprise Software (UK).
- `portfolio_count_tag` sorting returns a 500, so angels are ranked client-side.
