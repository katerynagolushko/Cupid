// Shared API routes for the local server and the Vercel function.
import { findAngels, warmPaths } from "./angels.mjs";
import { parseSmart } from "./parse.mjs";
import { getIndustries, search, match, revealedFor, investorProfile, companyInfo, STAGES, REGIONS } from "./pipeline.mjs";


function parseQuery(params) {
  const q = {
    industry: Number(params.get("industry") ?? 125403),
    stages: (params.get("stages") ?? "Pre-Seed|Seed").split("|").filter((s) => STAGES.includes(s)),
    region: Number(params.get("region") ?? 93),
    since: Number(params.get("since") ?? 2024),
    company: params.get("company") || null,
    vcOnly: params.get("vc_only") === "1",
  };
  if (!q.stages.length) throw Object.assign(new Error(`stages must be from ${STAGES.join(", ")}`), { status: 400 });
  if (!Number.isInteger(q.industry) || !Number.isInteger(q.region)) throw Object.assign(new Error("industry and region must be numeric IDs"), { status: 400 });
  if (!(q.since >= 2010 && q.since <= new Date().getFullYear())) throw Object.assign(new Error("since must be a year from 2010"), { status: 400 });
  return q;
}

async function thesis(params) {
  const uuid = params.get("investor");
  if (!uuid) throw Object.assign(new Error("investor is required"), { status: 400 });
  const q = parseQuery(params);
  const { investor, revealed, query } = await revealedFor(uuid, q);
  const profile = investor ?? (await investorProfile(uuid));
  if (!profile) throw Object.assign(new Error("investor not found"), { status: 404 });
  const { fetchStatedThesis, compareThesis } = await import("./thesis.mjs");
  const stated = await fetchStatedThesis({ name: profile.name, domain: profile.domain, about: profile.about });
  const verdict = compareThesis({ ...stated }, { ...revealed, segment_deals: revealed.industry_deals }, { industryName: query.industry.name, stages: q.stages, regionName: query.region.name, since: q.since });
  return { investor: { uuid, name: profile.name, domain: profile.domain }, stated, revealed, verdict };
}

export const routes = {
  "/api/options": async () => ({
    industries: await getIndustries(), stages: STAGES, regions: REGIONS,
    defaults: { industry: 125403, stages: ["Pre-Seed", "Seed"], region: 93, since: 2024 },
  }),
  "/api/search": async (p) => {
    const text = (p.get("q") ?? "").trim();
    return text.length < 2 ? { results: [] } : search(text);
  },
  "/api/match": async (p) => {
    const q = parseQuery(p);
    if (q.company) q.companyInfo = await companyInfo(q.company).catch(() => ({ uuid: q.company }));
    return match(q, { fresh: p.get("fresh") === "1" });
  },
  "/api/thesis": thesis,
  "/api/parse": async (p) => parseSmart(p.get("text") ?? "", await getIndustries(), REGIONS),
  "/api/angels": async (p) => {
    const industries = await getIndustries();
    const industry = Number(p.get("industry") ?? 125403);
    const customers = (p.get("customers") || String(industry)).split("|").map(Number).filter(Number.isInteger);
    const stage = ["Pre-Seed", "Seed", "Series A"].includes(p.get("stage")) ? p.get("stage") : "Seed";
    const region = Number(p.get("region") ?? 93);
    const since = Number(p.get("since") ?? 2023);
    if (!Number.isInteger(industry) || !Number.isInteger(region) || !customers.length) throw Object.assign(new Error("industry, customers and region must be numeric IDs"), { status: 400 });
    const prefs = { bigtech: p.get("bigtech") === "1", enterprise: p.get("enterprise") === "1", unicorn: p.get("unicorn") === "1", advisor: p.get("advisor") === "1", months: Number(p.get("months")) || null };
    const name = (id) => industries.find((x) => x.id === id)?.name ?? String(id);
    const res = await findAngels({ industry, industryName: name(industry), customers, customerNames: customers.map(name), region, stage, since, prefs }, { fresh: p.get("fresh") === "1" });
    return { ...res, region_name: REGIONS.find((r) => r.id === region)?.name ?? String(region) };
  },
  "/api/paths": async (p) => {
    const industry = Number(p.get("industry") ?? 125403), region = Number(p.get("region") ?? 93);
    const res = await findAngels({ industry, customers: [industry], region, stage: "Seed", since: 2023 });
    const angel = res.angels.find((a) => a.uuid === p.get("angel"));
    if (!angel) throw Object.assign(new Error("angel not in this search"), { status: 404 });
    return warmPaths(angel.uuid, angel.career, (p.get("me") ?? "").trim() || null);
  },
};

