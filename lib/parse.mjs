// Turns a dictated founder request into search preferences. Rule-based (no LLM key), shown back to the user.
const SYN = {
  Health: /health|medtech|medical|biotech|pharma|clinic|hospital|nhs|patient|wellness|femtech|life ?science/,
  Fintech: /fintech|payments?|banking|banks?\b|lending|insurtech|neobank|wealth|crypto|defi|accounting/,
  "Enterprise Software": /saas|b2b software|enterprise software|devtools?|developer tools?|\bai\b|infra|data platform|cyber|automation|productivity|hr ?tech|workflow/,
  Energy: /energy|climate|cleantech|solar|battery|batteries|carbon|grid|renewable/,
  Food: /food|agri|agtech|restaurant|grocery/,
  Education: /edtech|education|learning|school|universit/,
  "Real Estate": /proptech|real estate|property|construction/,
  Transportation: /mobility|transport|logistics|automotive|\bev\b|fleet/,
  Marketing: /martech|marketing|advertis|adtech/,
  Legal: /legal ?tech|\blegal\b|law firm|lawyer/,
  Security: /security|cybersecurity|identity|fraud/,
  Robotics: /robot|drone|hardware/,
  Media: /media|creator|music|gaming|games|content/,
  Semiconductors: /semiconductor|chips?\b/,
  Telecom: /telecom|5g|network operator/,
};
const REGION = [[93, /\buk\b|united kingdom|britain|british|london|england|scotland/], [76, /europe|european|\beu\b/], [133, /german|berlin|munich/], [433, /france|french|paris/], [323, /netherlands|dutch|amsterdam/], [703, /ireland|irish|dublin/], [203, /sweden|swedish|stockholm/], [283, /spain|spanish|madrid|barcelona/]];

export function parseRequest(text, industries) {
  const t = ` ${text.toLowerCase()} `;
  const byName = (n) => industries.find((i) => i.name === n);
  // "founder in X" / "building X" = industry; "selling to / customers are X" = customer industries
  const sellIdx = t.search(/sell(ing)? (in)?to|customers? (are|is|in)|clients? (are|in)|buyers?|go to market|gtm/);
  const before = sellIdx >= 0 ? t.slice(0, sellIdx) : t;
  const after = sellIdx >= 0 ? t.slice(sellIdx) : "";
  const found = (s) => Object.entries(SYN).filter(([, re]) => re.test(s)).map(([n]) => byName(n)).filter(Boolean);
  const industry = found(before)[0] ?? found(t)[0] ?? byName("Health");
  const customers = found(after);
  let stage = "Seed";
  if (/very( very)? early|pre[- ]?seed|idea stage|first (cheque|check)|day one|earliest/.test(t)) stage = "Pre-Seed";
  else if (/series a|\bseries-a\b/.test(t)) stage = "Series A";
  const m = t.match(/(?:past|last|within(?: the)?(?: past| last)?)\s+(\d+|twelve|six|three|eighteen|twenty[- ]four)\s+months?/);
  const words = { twelve: 12, six: 6, three: 3, eighteen: 18, "twenty four": 24, "twenty-four": 24 };
  let months = m ? Number(m[1]) || words[m[1]] : /past year|last year|this year|actively investing|active(ly)? invest/.test(t) ? 12 : null;
  const prefs = {
    bigtech: /faang|fang|maang|big tech|google|meta\b|facebook|amazon|apple|netflix|microsoft|deepmind/.test(t),
    enterprise: /enterprise compan|(large|big|huge) (enterprise|compan|corporat)|corporates?\b|fortune 500|ftse/.test(t),
    unicorn: /unicorn|decacorn|scale ?ups?|hypergrowth/.test(t),
    advisor: /advis|mentor|board/.test(t),
    months,
  };
  const region = (REGION.find(([, re]) => re.test(t)) ?? [93])[0];
  return { industry: industry.id, industryName: industry.name, customers: (customers.length ? customers : [industry]).map((c) => c.id), customerNames: (customers.length ? customers : [industry]).map((c) => c.name), stage, region, prefs };
}

// LLM parse (OpenAI gpt-6-luna) with validation; falls back to the rule-based parser.
import { readFileSync, existsSync } from "node:fs";
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? (existsSync(".openai.env") ? readFileSync(".openai.env", "utf8").match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim() : null);
export const LLM_MODEL = "gpt-6-luna";

export async function parseSmart(text, industries, regions) {
  const fallback = { ...parseRequest(text, industries), parser: "rules" };
  if (!OPENAI_KEY || !text.trim()) return fallback;
  const sys = `You turn a startup founder's dictated request into search filters for finding strategic angel investors.
Industries (pick exact names): ${industries.map((i) => i.name).join(", ")}.
Regions (pick id): ${regions.map((r) => `${r.id}=${r.name}`).join(", ")}. Default 93 (UK).
Return JSON: {"industry": "<what the founder builds>", "customers": ["<industries the founder sells to; same as industry if unclear>"], "stage": "Pre-Seed"|"Seed"|"Series A", "region": <id>,
"bigtech": bool (wants FAANG/big tech experience), "enterprise": bool (wants large enterprise/corporate experience), "unicorn": bool (wants unicorn/scale-up operators), "advisor": bool (wants angels who advise startups),
"months": number|null (max months since the angel's last investment; "actively investing" with no number = 12),
"titles": [lowercase job-title keywords the founder wants the angel to have held, e.g. "cmo","chief marketing","vp brand","head of partnerships","marketing director"; [] if none],
"company": string|null (the founder's company name if said), "reply": "<one short, casual sentence confirming what you'll search for. No dashes.>"}
"very early" means Pre-Seed. Speech-to-text may garble words; infer intent.`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: LLM_MODEL, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: text }] }),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const j = JSON.parse((await res.json()).choices[0].message.content);
    const byName = (n) => industries.find((i) => i.name.toLowerCase() === String(n ?? "").toLowerCase());
    const industry = byName(j.industry) ?? industries.find((i) => i.id === fallback.industry);
    const customers = (Array.isArray(j.customers) ? j.customers : []).map(byName).filter(Boolean);
    const cust = customers.length ? customers : [industry];
    return {
      industry: industry.id, industryName: industry.name, customers: cust.map((c) => c.id), customerNames: cust.map((c) => c.name),
      stage: ["Pre-Seed", "Seed", "Series A"].includes(j.stage) ? j.stage : fallback.stage,
      region: regions.some((r) => r.id === Number(j.region)) ? Number(j.region) : fallback.region,
      prefs: { bigtech: Boolean(j.bigtech), enterprise: Boolean(j.enterprise), unicorn: Boolean(j.unicorn), advisor: Boolean(j.advisor), months: Number(j.months) > 0 ? Math.round(Number(j.months)) : null,
        titles: (Array.isArray(j.titles) ? j.titles : []).map((t) => String(t).toLowerCase().trim()).filter((t) => t.length > 1).slice(0, 8) },
      company: j.company || null, reply: typeof j.reply === "string" ? j.reply : null, parser: LLM_MODEL,
    };
  } catch (err) {
    console.error("LLM parse failed, using rules:", err.message);
    return fallback;
  }
}
