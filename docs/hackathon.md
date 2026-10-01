# Dealroom API Hackathon — event facts

Sources: [Luma page](https://luma.com/u3mhdld7?tk=SWgAgT) and the on-site slide (photographed 1 Oct 2026). Where they differ, the slide wins because it is newer.

## On-site slide (verbatim transcription)

Photo of the screen at the venue, 1 Oct 2026. The original image is at `docs/slide.jpg`.

**Info & Links**

- Wifi Name: **PhoenixCourt**
- Wifi password: **BRILLplace**
- No key yet? Get your API key by emailing: [peter.foy@dealroom.co](mailto:peter.foy@dealroom.co)
- Dealroom API Information: [developers.beta.dealroom.co/getting-started/quickstart](https://developers.beta.dealroom.co/getting-started/quickstart)
- Cookbooks examples: [https://dealroom.co/cookbooks](https://dealroom.co/cookbooks)
- Submit your final product - Deadline 7:00PM: [https://qrco.de/dealoomAPI](https://qrco.de/dealoomAPI)
- Banner: "dealroom.co × Phoenix Court — API Hackathon — Thursday 1st of Oct, 4pm - 9PM @ Phoenix Court, London"

**Agenda**

- 4:00PM: Doors open
- 4:30PM: Hackathon starts!
- **7:00PM: Deadline to submit your product. & get some food**
- 7:30PM: Top 10 demos. 3min per demo.
- 8:00PM: Winners Announced! & Drinks

**Judges & Present final demo**

Criteria for judges to select top 10 demos:

- [ ] Does it work, live?
- [ ] Does it use the graph? Demonstrate of relationships not just rows
- [ ] Does it replace a workflow or other tools and save serious time? And for whom did you build this?

## All links

| What | Link | Source |
|---|---|---|
| Event page | [luma.com/u3mhdld7](https://luma.com/u3mhdld7?tk=SWgAgT) | Luma |
| Submit (deadline 7pm) | [qrco.de/dealoomAPI](https://qrco.de/dealoomAPI), which redirects to a [Google Form](https://docs.google.com/forms/d/e/1FAIpQLSc5-YDOpCFU7PZzamsgtFinFDg5YIfk-SwWH2BEC7kMkcBCuA/viewform) | Slide |
| API quickstart | [developers.beta.dealroom.co/getting-started/quickstart](https://developers.beta.dealroom.co/getting-started/quickstart) | Slide |
| Agent setup guide | [agent-setup.md](https://developers.beta.dealroom.co/getting-started/agent-setup.md) | SETUP.txt |
| Docs home / index | [developers.beta.dealroom.co](https://developers.beta.dealroom.co) · [llms.txt](https://developers.beta.dealroom.co/llms.txt) | SETUP.txt / docs |
| OpenAPI spec | [openapi.yaml](https://developers.beta.dealroom.co/openapi.yaml) | SETUP.txt |
| API keys page | [beta.dealroom.app/settings/api](https://beta.dealroom.app/settings/api) | Agent guide |
| Cookbooks | [dealroom.co/cookbooks](https://dealroom.co/cookbooks): [Capital Desk](https://dealroom.co/cookbooks/capital-desk/), [University Desk](https://dealroom.co/cookbooks/university-desk/), [Quantum Desk](https://dealroom.co/cookbooks/quantum-desk/), [Deal Board](https://dealroom.co/cookbooks/deal-board/), [GTM Desk](https://dealroom.co/cookbooks/gtm-desk/) | Slide |
| MCP server (legacy API) | `https://mcp.dealroom.co/mcp` | Docs |
| Terms | [dealroom.co/terms](https://dealroom.co/terms) | SETUP.txt |
| API key help | [peter.foy@dealroom.co](mailto:peter.foy@dealroom.co) | Slide |
| Support | [support@dealroom.co](mailto:support@dealroom.co) | Luma |

## Basics

| Item | Detail |
|---|---|
| Event | Dealroom API Hackathon, launch night for Dealroom's new AI-native private company data API |
| Date | Thursday 1 October 2026, 4pm to 9pm |
| Venue | Phoenix Court (home of LocalGlobe, Latitude and Solar), 2 Brill Pl, London NW1 1DX |
| Organiser | Dealroom.co, co-hosted by Phoenix Court |
| Hosts on Luma | Peter van Sabben, Orla Browne |
| Format | Solo or small teams, bring your own laptop, AI tools and subscriptions |
| Prizes | Three best builds win prizes (prizes not specified) |
| Wifi | `PhoenixCourt` / `BRILLplace` |
| API key help | peter.foy@dealroom.co |
| General support | support@dealroom.co |

## Agenda (slide)

| Time | What |
|---|---|
| 4:00pm | Doors open |
| 4:30pm | Hackathon starts |
| **7:00pm** | **Submission deadline**, then food |
| 7:30pm | Top 10 demos, **3 minutes each** |
| 8:00pm | Winners announced, drinks |

The Luma page says winners at 8:30pm; the slide says 8:00pm.

## Submission

Submit before 7:00pm at [qrco.de/dealoomAPI](https://qrco.de/dealoomAPI). It redirects to [this Google Form](https://docs.google.com/forms/d/e/1FAIpQLSc5-YDOpCFU7PZzamsgtFinFDg5YIfk-SwWH2BEC7kMkcBCuA/viewform), which needs a Google sign-in.

## Judging: how the top 10 demos are picked

1. **Does it work, live?**
2. **Does it use the graph?** Show relationships (company to founder to investor to fund to university), not just rows.
3. **Does it replace a workflow or other tools and save serious time? And who did you build it for?**

## Suggested build ideas (from Luma)

A sourcing agent, a market-map generator, a stealth-startup detector, an ecosystem dashboard, a future-founder detector, a competitor-movement dashboard, or "surprise us".

## Target audience

Developers, data-minded VCs and analysts, founders, and people building AI agents or investment tooling. No Dealroom experience needed.

## The API (summary)

The API puts companies, founders, investors, funding and signals into one connected graph. Full notes are in `AGENTS.md`, and docs are saved offline in `docs/reference/`.

| Item | Value |
|---|---|
| Docs | [developers.beta.dealroom.co](https://developers.beta.dealroom.co) ([llms.txt index](https://developers.beta.dealroom.co/llms.txt)) |
| OpenAPI | [openapi.yaml](https://developers.beta.dealroom.co/openapi.yaml), saved at `docs/reference/openapi.yaml` |
| Base URL | `https://api.beta.dealroom.app` |
| Token URL | `https://accounts.dealroom.co/oauth/token` (client credentials, audience `https://api.beta.dealroom.app`) |
| Rate limit | About 5 requests per second per key. On a 429, honour `Retry-After` |
| Key lifetime | About two weeks after the event, read-only, all data scopes |
| MCP | `https://mcp.dealroom.co/mcp` runs on the **legacy** API, not this beta |

## Cookbooks

[dealroom.co/cookbooks](https://dealroom.co/cookbooks) has five reference apps. Each has a demo and a build prompt, saved in `docs/cookbooks/`:

| Cookbook | What it does | Graph edges used |
|---|---|---|
| Capital Desk | LP to investment managers to fund vehicles | LP, investor, fund |
| University Desk | Universities to alumni founders to the companies they built | University, person, company |
| Quantum Desk | Sector funding momentum plus founder backgrounds | Company, rounds, founders |
| Deal Board | Personal deal pipeline with funding and team details | Company, rounds, team |
| GTM Desk | AI-compute prospect map from funding, growth and hiring | Company, jobs, news, people |

## Terms of use (from SETUP.txt)

- The key is personal. Do not share it, publish it or commit it.
- Hackathon projects only, within the rate limit. No bulk export, scraping, systematic copying, resale or redistribution of data.
- Dealroom can revoke the key at any time without notice.
