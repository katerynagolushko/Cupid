import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { get } from "../dealroom.mjs";

const enc = encodeURIComponent;
const US_COUNTRY_ID = 233;
const CACHE_DIR = "cache/match";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EXCLUDED_INVESTOR_TYPES = new Set(["government_non_profit", "university", "service_provider"]);

export const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B"];
export const REGIONS = [
  { id: 93, name: "United Kingdom" },
  { id: 76, name: "Europe (region, incl. UK & Türkiye)" },
  { id: 416, name: "European Union + UK" },
  { id: 133, name: "Germany" },
  { id: 433, name: "France" },
  { id: 323, name: "Netherlands" },
  { id: 703, name: "Ireland" },
  { id: 203, name: "Sweden" },
  { id: 283, name: "Spain" },
];

const PREFERRED_ROUND_STAGES = {
  ANGEL: ["Pre-Seed"],
  SEED: ["Pre-Seed", "Seed"],
  "EARLY VC": ["Seed", "Series A"],
  "SERIES A": ["Series A"],
  "SERIES B": ["Series B"],
};

let industriesCache;
export async function getIndustries() {
  industriesCache ??= (await get("/reference/filters/taxonomy_id/values?scope=companies&limit=200&type=industry")).data
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return industriesCache;
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

const img = (u) => (u ? (u.startsWith("http") ? u : `https://${u}`) : null);
const hqOf = (row) => row.locations?.find((l) => l.role === "hq");
const ym = (r) => (r.year ? `${r.year}-${String(r.month ?? 1).padStart(2, "0")}` : null);
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);

function monthsSince(ymStr) {
  if (!ymStr) return Infinity;
  const [y, m] = ymStr.split("-").map(Number);
  const now = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

export async function search(q) {
  const hits = (await get(`/data/search?q=${enc(q)}`)).data.filter((h) => h.type === "company").slice(0, 8);
  if (!hits.length) return { results: [] };
  const rows = (await get(`/data/companies?filter=${enc(`id[in_any]:${hits.map((h) => h.uuid).join("|")}`)}&view=summary&limit=8`)).data;
  const byId = new Map(rows.map((r) => [r.uuid, r]));
  return {
    results: hits.map((h) => {
      const row = byId.get(h.uuid);
      const hq = row && hqOf(row);
      const industry = row?.taxonomy?.find((t) => t.type === "industry");
      const regionId = hq?.country?.id && REGIONS.some((r) => r.id === hq.country.id)
        ? hq.country.id
        : hq?.continent?.name === "Europe" ? 76 : null;
      return {
        uuid: h.uuid, name: h.name, tagline: h.tagline, hq_country: h.hq_country, image: img(h.image),
        industry: industry ? { id: industry.id, name: industry.name } : null,
        last_round: null, region_id: regionId,
      };
    }),
  };
}

async function fetchRounds({ industry, stages, region, since }) {
  const filter = `and(hq_location[in_any]:${region},taxonomy_id[in_any]:${industry},taxonomy_id[nin_any]:1102801,growth_stage[nin_any]:412,standardized_round[in_any]:${stages.join("|")},year[gte]:${since},is_vc_round[eq]:true)`;
  const rounds = [];
  let cursor = null;
  do {
    const page = await get(`/data/transactions?filter=${enc(filter)}&limit=100&sort=-date${cursor ? `&cursor=${enc(cursor)}` : ""}`);
    rounds.push(...page.data);
    cursor = page.page?.next_cursor;
  } while (cursor && rounds.length < 3000);
  return { rounds, filter, truncated: Boolean(cursor) };
}

async function fetchInvestorProfiles(uuids) {
  const batches = [];
  for (let i = 0; i < uuids.length; i += 50) batches.push(uuids.slice(i, i + 50));
  const pages = await pool(batches, 3, (b) => get(`/data/investors?filter=${enc(`id[in_any]:${b.join("|")}`)}&view=summary&limit=50`));
  return new Map(pages.flatMap((p) => p.data).map((r) => [r.uuid, r]));
}

function cacheKey(q) {
  return `${q.industry}_${q.stages.join("-")}_${q.region}_${q.since}`.replace(/[^A-Za-z0-9_-]/g, "");
}

export async function match(q, { fresh = false } = {}) {
  const file = `${CACHE_DIR}/${cacheKey(q)}.json`;
  const cached = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  if (cached && !fresh && Date.now() - statSync(file).mtimeMs < CACHE_TTL_MS) return finalise(cached, q, true);
  try {
    const result = await computeMatch(q);
    try { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(result)); } catch {}
    return finalise(result, q, false);
  } catch (err) {
    if (cached) return finalise(cached, q, true);
    throw err;
  }
}

function finalise(result, q, fromCache) {
  let investors = result.investors;
  if (q.vcOnly) investors = investors.filter((i) => i.types.includes("venture capital"));
  if (q.company) investors = investors.map((inv) => ({ ...inv, deals: inv.deals.filter((d) => d.company.uuid !== q.company) }));
  investors = investors.slice(0, 25);
  return {
    ...result,
    query: { ...result.query, vc_only: Boolean(q.vcOnly), ...(q.company ? { company: q.companyInfo ?? { uuid: q.company } } : {}) },
    from_cache: fromCache,
    investors,
    bridges: result.bridges.map(({ companies, ...b }) => b),
    graph: buildGraph(investors, result.bridges),
  };
}

async function computeMatch(q) {
  const industries = await getIndustries();
  const industry = industries.find((i) => i.id === q.industry) ?? { id: q.industry, name: String(q.industry) };
  const region = REGIONS.find((r) => r.id === q.region) ?? { id: q.region, name: String(q.region) };
  const { rounds, truncated } = await fetchRounds(q);

  const investorUuids = [...new Set(rounds.flatMap((r) => (r.investors ?? []).map((i) => i.investor?.uuid).filter(Boolean)))];
  const profiles = await fetchInvestorProfiles(investorUuids);
  const countryOf = (uuid) => hqOf(profiles.get(uuid) ?? {})?.country;
  const typeCodes = (uuid) => (profiles.get(uuid)?.types ?? []).map((t) => t.code);
  const looksEuropean = (uuid) => {
    const p = profiles.get(uuid) ?? {};
    return /\.(uk|eu|de|fr|nl|ie|se|es|it|ch|dk|fi|no|be|at|pt|pl)$/i.test(p.domain ?? "") || /\bUK\b/.test(p.name ?? "");
  };
  const taggedUS = (uuid) => countryOf(uuid)?.id === US_COUNTRY_ID && !typeCodes(uuid).some((c) => EXCLUDED_INVESTOR_TYPES.has(c));
  const suspectHQ = [...profiles.keys()].filter((u) => taggedUS(u) && looksEuropean(u)).map((u) => profiles.get(u).name);
  const isUS = (uuid) => taggedUS(uuid) && !looksEuropean(uuid);

  const us = new Map();
  const bridgeStats = new Map();
  let roundsWithUS = 0;

  for (const r of rounds) {
    const parts = (r.investors ?? []).filter((p) => p.investor?.uuid);
    const usParts = parts.filter((p) => isUS(p.investor.uuid));
    if (!usParts.length) continue;
    roundsWithUS++;
    const names = parts.map((p) => p.investor.name);
    const deal = {
      company: { uuid: r.company?.uuid, name: r.company?.name, dealroom_url: r.company?.dealroom_url ?? null },
      date: ym(r), round: r.standardized_round, amount: r.amount || null, valuation: r.valuation || null,
      source_url: r.source_url ?? null,
    };
    for (const p of usParts) {
      const e = us.get(p.investor.uuid) ?? { uuid: p.investor.uuid, deals: [], coInvestors: new Map() };
      e.deals.push({ ...deal, is_lead: Boolean(p.is_lead), co_investors: names.filter((n) => n !== p.investor.name) });
      for (const o of parts) {
        if (o.investor.uuid === p.investor.uuid || isUS(o.investor.uuid)) continue;
        e.coInvestors.set(o.investor.uuid, (e.coInvestors.get(o.investor.uuid) ?? 0) + 1);
      }
      us.set(p.investor.uuid, e);
    }
    for (const o of parts) {
      if (isUS(o.investor.uuid)) continue;
      const b = bridgeStats.get(o.investor.uuid) ?? { uuid: o.investor.uuid, name: o.investor.name, dealroom_url: o.investor.dealroom_url ?? null, shared: 0, led: 0, partners: new Set(), companies: new Set() };
      b.shared++;
      if (o.is_lead) b.led++;
      usParts.forEach((p) => b.partners.add(p.investor.name));
      b.companies.add(r.company?.uuid);
      bridgeStats.set(o.investor.uuid, b);
    }
  }

  const maxDeals = Math.max(1, ...[...us.values()].map((e) => e.deals.length));
  const investors = [...us.values()].map((e) => {
    const p = profiles.get(e.uuid) ?? {};
    const hq = hqOf(p);
    const leads = e.deals.filter((d) => d.is_lead).length;
    const lastDeal = e.deals.map((d) => d.date).filter(Boolean).sort().at(-1) ?? null;
    const age = monthsSince(lastDeal);
    const prefStages = PREFERRED_ROUND_STAGES[p.investments?.preferred_round] ?? null;
    const breakdown = {
      segment_deals: Math.round(40 * Math.sqrt(e.deals.length / maxDeals)),
      leads: Math.round(15 * Math.min(leads, 3) / 3),
      recency: age <= 6 ? 20 : age <= 12 ? 14 : age <= 24 ? 8 : 3,
      stage_fit: prefStages == null ? 10 : prefStages.some((s) => q.stages.includes(s)) ? 25 : 5,
    };
    return {
      uuid: e.uuid, name: p.name ?? e.uuid, dealroom_url: p.dealroom_url ?? null, domain: p.domain ?? null, image: img(p.image),
      types: (p.types ?? []).map((t) => t.name), hq_city: hq?.city?.name ?? null,
      score: Object.values(breakdown).reduce((a, b) => a + b, 0), score_breakdown: breakdown,
      segment_deals: e.deals.length, leads, last_deal: lastDeal,
      preferred_round: p.investments?.preferred_round ?? null, total_investments: p.investments?.count ?? null,
      deal_size: p.deal_size?.max ? p.deal_size : null, about: p.about ?? null,
      deals: e.deals.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      bridges: [...e.coInvestors].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([uuid, shared]) => ({ uuid, name: profiles.get(uuid)?.name ?? bridgeStats.get(uuid)?.name, shared_deals: shared })),
    };
  }).sort((a, b) => b.score - a.score || b.segment_deals - a.segment_deals).slice(0, 80);

  const bridges = [...bridgeStats.values()]
    .filter((b) => !typeCodes(b.uuid).some((c) => EXCLUDED_INVESTOR_TYPES.has(c)))
    .sort((a, b) => b.shared - a.shared || b.led - a.led).slice(0, 15)
    .map((b) => ({
      uuid: b.uuid, name: profiles.get(b.uuid)?.name ?? b.name, hq_country: countryOf(b.uuid)?.name ?? null,
      dealroom_url: profiles.get(b.uuid)?.dealroom_url ?? b.dealroom_url, shared_deals_with_us: b.shared,
      us_partners: [...b.partners].slice(0, 6), deals_led: b.led, companies: [...b.companies],
    }));

  const amounts = rounds.map((r) => r.amount).filter((a) => a > 0).sort((a, b) => a - b);
  const valuations = rounds.map((r) => r.valuation).filter((v) => v > 0).sort((a, b) => a - b);

  return {
    query: { industry, stages: q.stages, region, since: q.since },
    method: `VC rounds (is_vc_round; Mature and Outside Tech excluded) for companies HQ'd in ${region.name}, industry ${industry.name}, standardised round in ${q.stages.join("/")}, ${q.since} onwards → every investor on those rounds → kept investors HQ'd in the United States (excluding government, university and service-provider investors).`,
    retrieved_at: new Date().toISOString(),
    stats: {
      rounds: rounds.length, investors: investorUuids.length,
      us_investors: [...profiles.keys()].filter(isUS).length,
      rounds_with_us_investor: roundsWithUS,
      us_share_of_rounds: rounds.length ? roundsWithUS / rounds.length : 0,
    },
    benchmark: {
      n_amount: amounts.length, median_amount: pct(amounts, 0.5), p25_amount: pct(amounts, 0.25), p75_amount: pct(amounts, 0.75),
      n_valuation: valuations.length, median_valuation: pct(valuations, 0.5),
    },
    investors,
    bridges,
    caveats: [
      `Company attribution is by HQ only (Dealroom's VC-funding convention); investor location is Dealroom's recorded HQ.`,
      `${new Date().getFullYear()} is a partial year.`,
      "Valuations may include Dealroom estimates; amounts are in USD.",
      "Undisclosed participants are not captured, so US involvement is a lower bound.",
      ...(suspectHQ.length ? [`Excluded ${suspectHQ.length} investor(s) recorded as US-HQ whose website or name suggests Europe (likely geocoding error): ${suspectHQ.join(", ")}.`] : []),
      ...(truncated ? ["Cohort truncated at 3,000 rounds."] : []),
    ],
  };
}

function buildGraph(investors, bridges) {
  const topUS = investors.slice(0, 12);
  const nodes = new Map();
  const edges = [];
  const companyIds = new Set();
  for (const inv of topUS) {
    nodes.set(inv.uuid, { id: inv.uuid, label: inv.name, kind: "us_investor" });
    for (const d of inv.deals) {
      if (!d.company.uuid) continue;
      companyIds.add(d.company.uuid);
      if (!nodes.has(d.company.uuid)) nodes.set(d.company.uuid, { id: d.company.uuid, label: d.company.name, kind: "company" });
      edges.push({ source: inv.uuid, target: d.company.uuid, is_lead: d.is_lead });
    }
  }
  for (const b of bridges.slice(0, 8)) {
    const shared = b.companies.filter((c) => companyIds.has(c));
    if (!shared.length) continue;
    nodes.set(b.uuid, { id: b.uuid, label: b.name, kind: "bridge_investor" });
    shared.forEach((c) => edges.push({ source: b.uuid, target: c, is_lead: false }));
  }
  const list = [...nodes.values()];
  if (list.length > 80) {
    const keep = new Set(list.filter((n) => n.kind !== "company").map((n) => n.id));
    const degree = new Map();
    edges.forEach((e) => degree.set(e.target, (degree.get(e.target) ?? 0) + 1));
    [...degree].sort((a, b) => b[1] - a[1]).slice(0, 80 - keep.size).forEach(([id]) => keep.add(id));
    return { nodes: list.filter((n) => keep.has(n.id)), edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
  }
  return { nodes: list, edges };
}

export async function revealedFor(investorUuid, q) {
  const m = await match(q);
  const inv = m.investors.find((i) => i.uuid === investorUuid);
  if (!inv) return { investor: null, revealed: { stages: {}, industry_deals: 0, region_deals: 0, leads: 0, last_deal: null }, query: m.query };
  const stages = {};
  inv.deals.forEach((d) => { if (d.round) stages[d.round] = (stages[d.round] ?? 0) + 1; });
  return {
    investor: inv, query: m.query,
    revealed: { stages, industry_deals: inv.segment_deals, region_deals: inv.segment_deals, leads: inv.leads, last_deal: inv.last_deal },
  };
}

export async function companyInfo(uuid) {
  const row = (await get(`/data/companies?filter=${enc(`id[in_any]:${uuid}`)}&view=summary&limit=1`)).data[0];
  return row ? { uuid, name: row.name, tagline: row.tagline } : { uuid };
}

export async function investorProfile(uuid) {
  const page = await get(`/data/investors?filter=${enc(`id[in_any]:${uuid}`)}&view=summary&limit=1`);
  return page.data[0] ?? null;
}
