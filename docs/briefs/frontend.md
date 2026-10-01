# Brief: frontend for "Cross the Pond"

Repo: `/Users/mtk/Documents/Development/GenAI/dealroomhack` (macOS, zsh, Node 23). **No npm installs, no frameworks, no build step.** Deadline: working by about 6:15pm UK time (it is about 5:05pm). The 3-minute live stage demo must look great, be fast and never break.

**First, read** `AGENTS.md`, `docs/api-contract.md` (the contract: follow its JSON shapes exactly) and `docs/feasibility.md`. Optionally skim `/Users/mtk/.claude/skills/impeccable/SKILL.md` for design guidance, but install nothing.

## Product

"Cross the Pond" is for UK and European founders who are raising and want US investors. Raising in the UK is hard and many founders turn to the US, but they don't know which US funds actually invest in UK/EU companies at their stage and in their sector. The tool shows:
1. US investors ranked by evidence: the real Dealroom funding rounds they joined in the founder's industry, stage and region.
2. "Says vs Does" for each investor: their stated thesis from their website against their actual behaviour.
3. Bridge investors: UK/EU funds that repeatedly co-invest with US funds, which is a warm intro path.
4. A round-size benchmark.

The judges score whether it works live, whether it uses the **graph** (relationships, not just rows), and whether it replaces a workflow (and for whom). **The UI must visibly show relationships.**

## Build only these files

`public/index.html`, `public/app.js` (vanilla ES module), `public/styles.css`, and the fixtures `public/mock/options.json`, `public/mock/search.json`, `public/mock/match.json`, `public/mock/thesis.json`. The fixtures must match the contract exactly and use realistic data:
- US investors: Techstars, Y Combinator, SOSV, Plug and Play, Ascension Ventures, Zetta Venture Partners, LDV Capital, OMX Ventures.
- UK bridges: Seedcamp, Kindred Capital, Ada Ventures, Octopus Ventures.
- UK health companies: Droplet Scientific, Fuse, Neurotype, Hesta Health.

Another agent is building `server.mjs` and `lib/`. Do not create or edit those, `dealroom.mjs` or `.env`.

## Behaviour

- Call the real endpoints (`/api/options`, `/api/search`, `/api/match`, `/api/thesis`). If a request fails, or the URL has `?mock=1`, fall back to `/mock/*.json` and show a small "Saved data" badge. In production the app is served from the same origin (`http://localhost:3000`, with `public/` as the static root).
- **Top of the page:** a one-line value proposition, then the controls:
  - Company search autocomplete (`/api/search?q=`, 250ms debounce). Selecting a result prefills industry, stage and region.
  - Manual inputs: an industry select, stage chips (multi-select), a region select and a "since" year.
  - A "Find US investors" button that calls `/api/match?industry=..&stages=Pre-Seed|Seed&region=..&since=..[&company=uuid]`. Pipe-join the stages and URL-encode.
- **Headline stat strip** from `stats` and `benchmark`, for example: "734 rounds · 629 investors · 109 US investors · 20% of rounds had a US investor · median round $1.6M (n=680)". Format money compactly. Show `query.method` and `retrieved_at` in small text underneath, because judges value transparency.
- **Main area, two columns:**
  - Left: a ranked list of US investor cards. Each shows name, types, HQ city, a score bar (breakdown in a tooltip), segment deals, leads, last deal and a Dealroom link.
  - Right: a **relationship graph** built from `match.graph`. Write a simple force-directed layout yourself in SVG (no libraries). Colour the three node kinds differently and draw lead edges solid. Hovering highlights neighbours; clicking an investor node opens its detail. Run a fixed number of iterations, then stop, so it doesn't jitter on stage.
- **Investor detail drawer:**
  - A deals table: company link, date, round, amount, lead badge, source link, co-investors.
  - The investor's bridges ("Warm path: Seedcamp co-invested 3×").
  - "Says vs Does": lazily call `/api/thesis?investor=uuid&industry=..&stages=..&region=..`. It can take up to 15s, so show a loading state. Render stated (stages, sectors, geographies, cheque, quotes, sources) and revealed side by side, with verdict chips (match / mismatch / unknown) and `verdict.summary`.
- **Bridges table:** name, HQ country, shared deals with US investors, US partners, deals led.
- Caveats at the bottom.
- Loading, empty and error states everywhere. Keyboard accessible. Laptop-projector friendly at 1280–1440px wide.
- **Design:** confident and clean, with good typography (a system stack or a Google Font is fine). Avoid the generic purple-gradient AI look. Use UK spelling.

## Test

At minimum, run `node --check public/app.js` and parse every fixture with `JSON.parse`. If you can, serve `public/` on port 3100 with a tiny Node static server written in `/tmp` (not in the repo), load `/?mock=1` and check for errors. Kill any server you start. Python SSL is broken on this machine, but `python3 -m http.server` works for local serving.

## Return

A short summary covering: the files created, how the mock fallback works, any assumptions or deviations from the contract, and anything the server must provide that isn't in the contract.
