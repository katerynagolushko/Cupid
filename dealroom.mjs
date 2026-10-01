// Usage:
//   node dealroom.mjs                      -> verification request, printed as a table
//   node dealroom.mjs "/data/companies?limit=5&filter=..."   -> raw JSON for any GET path
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const API = "https://api.beta.dealroom.app";
const TOKEN_CACHE = process.env.VERCEL ? "/tmp/.dealroom-token.json" : ".dealroom-token.json";
const USER_AGENT = "dealroomhack/1.0";

const env = existsSync(".env") ? Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
) : process.env;
const clientId = env.DEALROOM_CLIENT_ID;
const clientSecret = env.DEALROOM_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("No DEALROOM_CLIENT_ID or DEALROOM_CLIENT_SECRET in .env");

async function getToken(forceRefresh = false) {
  if (!forceRefresh && existsSync(TOKEN_CACHE)) {
    const cached = JSON.parse(readFileSync(TOKEN_CACHE, "utf8"));
    if (cached.expiresAt - 60_000 > Date.now()) return cached.accessToken;
  }
  const res = await fetch("https://accounts.dealroom.co/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: "https://api.beta.dealroom.app",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  writeFileSync(TOKEN_CACHE, JSON.stringify({ accessToken: access_token, expiresAt: Date.now() + expires_in * 1000 }), { mode: 0o600 });
  return access_token;
}

export async function get(path) {
  let token = await getToken();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API + path, {
      headers: { Authorization: `Bearer ${token}`, "X-Client-Id": clientId, "User-Agent": USER_AGENT },
    });
    if (res.status === 401 && attempt === 0) { token = await getToken(true); continue; }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after") ?? 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${await res.text()}`);
    return res.json();
  }
  throw new Error(`GET ${path} failed after retries`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
const arg = process.argv[2];
if (!isMain) {
  // imported as a module
} else if (arg) {
  console.log(JSON.stringify(await get(arg), null, 2));
} else {
  const filter = "and(classification[in_any]:vc_backed,launch_date[gte]:2020)";
  const body = await get(`/data/companies?sort=-latest_valuation&limit=10&include_total=true&filter=${encodeURIComponent(filter)}`);
  console.table(body.data.map((c) => ({
    name: c.name,
    hq_country: c.locations?.find((l) => l.role === "hq")?.country?.name,
    launch_year: c.launch_date?.slice(0, 4),
    "latest_valuation.value": c.valuation?.value,
  })));
  if (body.page?.total != null) console.log(`Total matching: ${body.page.total}`);
}
