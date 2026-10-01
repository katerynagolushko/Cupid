> ## Documentation Index
> Fetch the complete documentation index at: https://developers.beta.dealroom.co/llms.txt
> Use this file to discover all available pages before exploring further.

# Model Context Protocol (MCP)

> Connect AI agents to Dealroom data through the Dealroom MCP server. Install in Cursor, Claude Desktop, or any MCP-compatible client.

The Dealroom MCP server exposes Dealroom's data — companies, investors,
funding rounds, founders, ecosystems, news — as Model Context Protocol tools so
AI agents can query it conversationally without you writing API client code.

<Warning>
  The current MCP server uses Dealroom's legacy API, not the open beta API
  documented on this site. An MCP server built on the new API is planned after
  the open beta. Its tools and response shapes may differ from the current
  server.
</Warning>

## Server endpoint

```text theme={null}
https://mcp.dealroom.co/mcp
```

The server speaks the standard MCP JSON-RPC over HTTP and authenticates with
the same Auth0 OAuth2 flow as the REST API.

## One-click install

Click the **Install in Cursor** action in the top-right of any docs page to
register the Dealroom MCP server with your local Cursor installation. The
button is wired to the `cursor://` deeplink protocol and configures the
server endpoint for you.

## Manual install (Claude Desktop, Cline, other clients)

Add the following to your client's MCP config:

```json theme={null}
{
  "mcpServers": {
    "dealroom": {
      "url": "https://mcp.dealroom.co/mcp"
    }
  }
}
```

Your client will prompt for Auth0 authentication on first connect.

## What you can ask the agent

Sample prompts:

* "Find the top 10 fintech startups in the Netherlands by total funding."
* "Compare Stripe's portfolio to Adyen's."
* "Show me unicorn rounds in 2025 with revenue over \$100M."

The current MCP server translates these prompts into calls to the legacy API.
Use the [API Reference overview](/endpoint-overviews/discovery) for the Early
Access REST API instead.
