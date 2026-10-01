// Strategic angels: active angels in your industry/region, ranked by what their careers can open for you.
// Graph walk: angel (person) -> /people/{id}/career -> companies (industry, unicorn, size) and
// angel -> /investors/{id}/portfolio (deals in your industry) as evidence.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { get } from "../dealroom.mjs";

const enc = encodeURIComponent;
const CACHE_DIR = process.env.VERCEL ? "/tmp/cache/angels" : "cache/angels";
const BUNDLED_DIR = "cache/angels";
const CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const DEEP_LIMIT = 60; // angels we walk the career + portfolio graph for

const BIGTECH = /^(google|alphabet|google deepmind|deepmind|meta|facebook|instagram|whatsapp|amazon|amazon web services|aws|apple|netflix|microsoft|linkedin|github|youtube|nvidia|openai|salesforce|uber|airbnb|stripe|spotify|twitter|x corp|oracle|ibm|intel|tesla)\b/i;
const img = (u) => (u ? (u.startsWith("http") ? u : `https://${u}`) : null);

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]).catch(() => null); }
  }));
  return out;
}

function monthsSince(d) {
  if (!d) return Infinity;
  const [y, m = 6] = String(d).split("-").map(Number);
  const now = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

const STAGE_FIT = {
  "Pre-Seed": { ANGEL: 1, SEED: 1, "EARLY VC": 0.4 },
  Seed: { SEED: 1, ANGEL: 0.8, "EARLY VC": 0.7 },
  "Series A": { "EARLY VC": 1, "SERIES A": 1, SEED: 0.5 },
};

function roleOf(c) {
  const t = (c.raw_title ?? c.titles?.join(" ") ?? "").toLowerCase();
  if (c.company?.subtype === "investor") return "investor";
  if (c.is_founder || /founder|co-owner|owner/.test(t)) return "founder";
  if (/investor|angel|shareholder|backer|\blp\b/.test(t)) return "backer";
  if (/board|chair|non-exec|\bned\b|director of the board/.test(t)) return "board";
  if (/advis|mentor|venture partner|ambassador/.test(t)) return "advisor";
  if (c.is_executive || /\b(ceo|cto|coo|cfo|cmo|cpo|chief|president|vp|vice president|head|director|gm|general manager|lead|partner)\b/.test(t)) return "executive";
  if (t) return "employee";
  return "linked";
}
const ROLE_WEIGHT = { founder: 1, executive: 1, employee: 0.75, board: 0.8, advisor: 0.7, linked: 0.45, backer: 0.25, investor: 0 };
const ROLE_LABEL = { founder: "Founder", executive: "Executive", employee: "Operator", board: "Board", advisor: "Advisor", linked: "Linked", backer: "Backer", investor: "Investor" };

function careerItem(c) {
  const co = c.company ?? {};
  const industries = (co.taxonomy ?? []).filter((t) => t.type === "industry").map((t) => ({ id: t.id, name: t.name }));
  const cls = (co.classifications ?? []).map((x) => (typeof x === "string" ? x : x.name ?? x.code));
  return {
    uuid: co.uuid, name: co.name, domain: co.domain, image: img(co.image), tagline: co.tagline,
    dealroom_url: co.dealroom_url, subtype: co.subtype,
    title: c.raw_title ?? c.titles?.join(", ") ?? null, role: roleOf(c), is_past: Boolean(c.is_past),
    industries, unicorn: co.unicorn_type ?? (cls.includes("unicorn") ? "unicorn" : null),
    employees: co.employees_count ?? null, status: co.status ?? null,
    corporate: co.subtype === "company" && (co.employees_count ?? 0) >= 1000,
    startup: cls.includes("startup") && (co.employees_count ?? 0) < 1000,
    bigtech: BIGTECH.test(co.name ?? ""),
    valuation: co.valuation?.value ?? null,
  };
}

async function fetchAngelPool({ industry, region, since }) {
  const filter = `and(investor_type[in_any]:angel,hq_location[in_any]:${region},investor_experience_id[in_any]:${industry},last_investor_round_date[gte]:${since})`;
  const rows = [];
  let cursor = null;
  do {
    const path = `/data/investors?filter=${enc(filter)}&view=summary&limit=100${cursor ? `&cursor=${enc(cursor)}` : ""}`;
    let page;
    for (let attempt = 0; ; attempt++) {
      try { page = await get(path); break; } catch (err) {
        if (attempt >= 3 || !/\(5\d\d\)/.test(err.message)) throw err;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    rows.push(...page.data);
    cursor = page.page?.next_cursor;
  } while (cursor && rows.length < 400);
  return { rows, filter };
}

function preRank(a) {
  const inv = a.investor?.investments ?? {};
  return Math.sqrt(inv.count ?? 0) * 2 - Math.min(36, monthsSince(inv.last_round_date)) / 6;
}

function cacheKey(q) {
  return `v2_${q.industry}_${q.region}_${q.since}`.replace(/[^A-Za-z0-9_-]/g, "");
}

export async function findAngels(q, { fresh = false } = {}) {
  let file = `${CACHE_DIR}/${cacheKey(q)}.json`;
  const bundled = `${BUNDLED_DIR}/${cacheKey(q)}.json`;
  const readFrom = existsSync(file) ? file : existsSync(bundled) ? bundled : null;
  const cached = readFrom ? JSON.parse(readFileSync(readFrom, "utf8")) : null;
  let base, fromCache = true;
  if (cached && !fresh && (process.env.VERCEL || Date.now() - statSync(readFrom).mtimeMs < CACHE_TTL_MS)) base = cached;
  else {
    try {
      base = await Promise.race([fetchBase(q), new Promise((_, rej) => setTimeout(() => rej(new Error("Dealroom timed out")), Number(process.env.LIVE_BUDGET_MS ?? 8000)))]);
      try { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(base)); } catch {}
      fromCache = false;
    } catch (err) {
      if (cached) base = cached;
      else {
        const pooled = globalBase();
        if (!pooled) throw err;
        return { ...rank(pooled, q), from_cache: true, fallback: `Dealroom was too slow for live ${q.industryName ?? ""} angels, so this ranks the ${pooled.angels.length} angels we already mapped against your ask.` };
      }
    }
  }
  return { ...rank(base, q), from_cache: fromCache };
}

// Every cached angel across industries (deduped), used when a live fetch fails.
function globalBase() {
  const seen = new Map();
  let pool = 0, retrieved_at = null, filter = "cached pool";
  for (const dir of [CACHE_DIR, BUNDLED_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.startsWith("v2_"))) {
      const b = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      pool += b.pool; retrieved_at ??= b.retrieved_at;
      for (const a of b.angels) if (!seen.has(a.uuid)) seen.set(a.uuid, { ...a, deals: [] });
    }
  }
  return seen.size ? { pool: seen.size, filter, angels: [...seen.values()], retrieved_at, took_ms: 0 } : null;
}

// Raw graph for an industry + region: angel pool, careers, industry portfolio. Preference-independent.
async function fetchBase(q) {
  const started = Date.now();
  const { rows, filter } = await fetchAngelPool(q);
  const deep = [...rows].sort((a, b) => preRank(b) - preRank(a)).slice(0, DEEP_LIMIT);
  const [careers, portfolios] = await Promise.all([
    pool(deep, 3, (a) => get(`/data/people/${a.uuid}/career?limit=40`)),
    pool(deep, 2, (a) => get(`/data/investors/${a.uuid}/portfolio?limit=50&filter=${enc(`taxonomy_id[in_any]:${q.industry}`)}`)),
  ]);
  const angels = deep.map((a, i) => {
    const inv = a.investor?.investments ?? {};
    const hq = a.locations?.find((l) => l.role === "hq");
    return {
      uuid: a.uuid, name: a.name, image: img(a.image), dealroom_url: a.dealroom_url,
      linkedin: a.links?.linkedin ?? null, twitter: a.links?.twitter ?? null, city: hq?.city?.name ?? null, about: a.about ?? null,
      investments: { count: inv.count ?? 0, preferred_round: inv.preferred_round ?? null, last_round_date: inv.last_round_date ?? null },
      career: (careers[i]?.data ?? []).map(careerItem).filter((c) => c.uuid && c.name),
      deals: (portfolios[i]?.data ?? []).map((p) => ({
        uuid: p.company?.uuid, name: p.company?.name, tagline: p.company?.tagline, image: img(p.company?.image),
        dealroom_url: p.company?.dealroom_url, is_lead: Boolean(p.is_lead), last_round_date: p.last_round_date,
      })).filter((d) => d.uuid),
    };
  });
  return { pool: rows.length, filter, angels, retrieved_at: new Date().toISOString(), took_ms: Date.now() - started };
}

const OPERATOR = new Set(["founder", "executive", "employee"]);

function rank(base, q) {
  const prefs = q.prefs ?? {};
  const customerSet = new Set(q.customers);
  let angels = base.angels.map((a0) => {
    const a = { ...a0, career: a0.career.map((c) => ({ ...c, bigtech: c.bigtech ?? BIGTECH.test(c.name ?? "") })) };
    const operating = a.career.filter((c) => c.role !== "investor");
    const doors = operating.filter((c) => c.role !== "backer" && c.industries.some((x) => customerSet.has(x.id)));
    const unicorns = operating.filter((c) => c.unicorn && c.role !== "backer");
    const corporates = operating.filter((c) => c.corporate && c.role !== "backer");
    const bigtech = operating.filter((c) => c.bigtech && c.role !== "backer");
    const titleRe = prefs.titles?.length ? new RegExp(prefs.titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
    const titled = titleRe ? operating.filter((c) => c.role !== "backer" && titleRe.test(c.title ?? "") && !/intern|trainee|assistant|student/i.test(c.title ?? "")) : [];
    const advisories = a.career.filter((c) => ["advisor", "board"].includes(c.role) && c.subtype === "company");
    const recentDeals = a.deals.filter((d) => monthsSince(d.last_round_date) <= 36).length;
    const fit = STAGE_FIT[q.stage]?.[a.investments.preferred_round] ?? 0.3;
    const lastMonths = monthsSince(a.investments.last_round_date);
    const recency = Math.max(0, 1 - Math.max(0, lastMonths - 3) / 21);

    // Background: what the founder asked for (big tech / enterprise / unicorn); default = unicorn + enterprise pedigree
    const wantBg = prefs.bigtech || prefs.enterprise || prefs.unicorn;
    const titlePts = titled.reduce((s, c) => s + (c.industries.some((x) => customerSet.has(x.id)) || c.corporate ? 1.5 : 1), 0);
    const bgPts = titlePts + (prefs.bigtech ? bigtech.reduce((s, c) => s + ROLE_WEIGHT[c.role], 0) : 0)
      + (prefs.enterprise ? corporates.reduce((s, c) => s + ROLE_WEIGHT[c.role] * 0.7, 0) : 0)
      + (prefs.unicorn || !wantBg ? unicorns.reduce((s, c) => s + ROLE_WEIGHT[c.role] * (c.unicorn === "unicorn" ? 1 : 1.3), 0) : 0)
      + (!wantBg ? corporates.length * 0.2 : 0);
    const parts = {
      background: Math.round(Math.min(1, bgPts / 1.5) * 25),
      doors: Math.round(Math.min(1, doors.reduce((s, c) => s + ROLE_WEIGHT[c.role], 0) / 2) * 25),
      advisor: Math.round(Math.min(1, advisories.length / 3) * 15),
      sector: Math.round(Math.min(1, Math.sqrt(a.deals.length) / Math.sqrt(8)) * 15),
      stage: Math.round(fit * 10),
      recency: Math.round(recency * 10),
    };
    const score = Object.values(parts).reduce((s, v) => s + v, 0);

    const why = [];
    const tt = titled.find((c) => c.industries.some((x) => customerSet.has(x.id))) ?? titled.find((c) => c.corporate) ?? titled[0];
    if (tt) why.push(`${tt.title} at ${tt.name}${tt.employees ? ` (${tt.employees.toLocaleString()} staff)` : ""}`);
    const bt = bigtech.find((c) => OPERATOR.has(c.role)) ?? bigtech[0];
    if (prefs.bigtech && bt && bt !== tt) why.push(`${ROLE_LABEL[bt.role]}${bt.title ? ` (${bt.title})` : ""} at ${bt.name}`);
    const opDoor = doors.find((c) => OPERATOR.has(c.role)) ?? doors[0];
    if (opDoor && opDoor !== bt && opDoor !== tt) why.push(`${ROLE_LABEL[opDoor.role]}${opDoor.title ? ` (${opDoor.title})` : ""} at ${opDoor.name}, a ${opDoor.industries.map((x) => x.name).join("/")} company`);
    const uni = unicorns.find((c) => c !== opDoor && c !== bt);
    if (uni) why.push(`${ROLE_LABEL[uni.role]} at ${uni.name} (${uni.unicorn})`);
    if (prefs.enterprise && !bt) { const corp = corporates.find((c) => c !== opDoor && c !== uni); if (corp) why.push(`${ROLE_LABEL[corp.role]} at ${corp.name} (${corp.employees.toLocaleString()} staff)`); }
    if (advisories.length >= 2) why.push(`Advisor/board at ${advisories.length} companies`);
    if (a.deals.length) why.push(`${a.deals.length} deal${a.deals.length > 1 ? "s" : ""} in ${q.industryName ?? "your industry"}${recentDeals ? `, ${recentDeals} in the last 3 years` : ""}`);

    return { ...a, score, parts, why, last_months: lastMonths,
      doors: doors.map((c) => c.uuid), unicorns: unicorns.map((c) => c.uuid), corporates: corporates.map((c) => c.uuid),
      bigtech: bigtech.map((c) => c.uuid), titled: titled.map((c) => c.uuid), advisories: advisories.map((c) => c.uuid),
      matches: { bigtech: bigtech.length > 0, enterprise: corporates.length > 0, unicorn: unicorns.length > 0, advisor: advisories.length >= 2, recent: !prefs.months || lastMonths <= prefs.months } };
  });

  // Hard filters the founder asked for; relax background if it would empty the list
  const total = angels.length;
  if (prefs.months) angels = angels.filter((a) => a.matches.recent);
  const bgKeys = ["bigtech", "enterprise", "unicorn"].filter((k) => prefs[k]);
  if (bgKeys.length) { const strict = angels.filter((a) => bgKeys.some((k) => a.matches[k])); if (strict.length >= 3) angels = strict; }
  if (prefs.titles?.length) { const strict = angels.filter((a) => a.titled.length); if (strict.length >= 3) angels = strict; }
  if (prefs.advisor) { const strict = angels.filter((a) => a.advisories.length >= 1); if (strict.length >= 3) angels = strict; }
  angels.sort((a, b) => b.score - a.score);

  const companyAngels = new Map();
  for (const a of angels) for (const c of a.career) {
    if (c.role === "investor") continue;
    if (!companyAngels.has(c.uuid)) companyAngels.set(c.uuid, { company: c, angels: new Set() });
    companyAngels.get(c.uuid).angels.add(a.uuid);
  }
  const hubs = [...companyAngels.values()].filter((h) => h.angels.size > 1)
    .map((h) => ({ uuid: h.company.uuid, name: h.company.name, unicorn: h.company.unicorn, industries: h.company.industries, angels: [...h.angels] }))
    .sort((a, b) => b.angels.length - a.angels.length).slice(0, 20);
  const cc = angels.flatMap((a) => a.career.filter((c) => c.role !== "investor"));
  const uniq = (arr) => new Set(arr.map((c) => c.uuid)).size;
  return {
    query: q,
    stats: {
      pool: base.pool, analysed: total, shown: angels.length, career_links: cc.length,
      unicorn_companies: uniq(cc.filter((c) => c.unicorn)),
      bigtech_angels: angels.filter((a) => a.bigtech.length).length,
      door_companies: uniq(cc.filter((c) => c.industries.some((x) => customerSet.has(x.id)))),
      angels_with_unicorn: angels.filter((a) => a.unicorns.length).length,
      angels_with_doors: angels.filter((a) => a.doors.length).length,
    },
    angels, hubs,
    method: {
      filter: base.filter,
      note: `Angels = Dealroom investors of type "angel", HQ in the region, with ${q.industryName ?? "industry"} experience and a round since ${q.since}. The top ${DEEP_LIMIT} by deal count and recency are walked through their career (/people/{id}/career) and ${q.industryName ?? "industry"} portfolio (/investors/{id}/portfolio). Unicorn = Dealroom unicorn_type on the career company. Enterprise = 1,000+ staff.`,
      score: "Background you asked for 25 · doors into your customer industry 25 · advisor roles 15 · deals in your industry 15 · stage fit 10 · recency 10",
    },
    retrieved_at: base.retrieved_at, took_ms: base.took_ms,
  };
}

// Find an angel in any cached base (fast, no live calls).
export function cachedAngel(uuid) {
  for (const dir of [CACHE_DIR, BUNDLED_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.startsWith("v2_"))) {
      const a = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).angels.find((x) => x.uuid === uuid);
      if (a) return { ...a, career: a.career.map((c) => ({ ...c, bigtech: c.bigtech ?? BIGTECH.test(c.name ?? "") })) };
    }
  }
  return null;
}

const timed = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const PATHS_DIR = process.env.VERCEL ? "/tmp/cache/paths" : "cache/paths";
const VC_TITLE = /investor|venture|\bvc\b|angel|limited partner|\blp\b|fund/i;
const pathsMem = new Map();

// Warm paths: who is closest to this angel (co-workers at their companies), and where you overlap.
// Prioritises companies in your customer industry / matching the roles you asked for; operators before investors.
export async function warmPaths(angelUuid, angelCareer, meName, { customers = [], titles = [] } = {}) {
  const key = `${angelUuid}_${customers.join("-")}${meName ? "_me" : ""}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 180);
  if (pathsMem.has(key)) return pathsMem.get(key);
  for (const dir of [PATHS_DIR, "cache/paths"]) {
    const f = `${dir}/${key}.json`;
    if (existsSync(f)) { const r = JSON.parse(readFileSync(f, "utf8")); pathsMem.set(key, r); return r; }
  }
  const cust = new Set(customers);
  const titleRe = titles.length ? new RegExp(titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
  const ROLE_RE = /cmo|chief marketing|marketing|brand|partnership|commercial|growth|sales|ceo|founder|chief|head|director|vp|president/i;
  const rankCo = (c) => (c.industries.some((x) => cust.has(x.id)) ? 4 : 0) + (titleRe && titleRe.test(c.title ?? "") ? 4 : 0)
    + (c.corporate ? 1.5 : 0) + (["founder", "executive"].includes(c.role) ? 1 : 0) + (c.unicorn ? 0.5 : 0);
  const keyCos = angelCareer.filter((c) => c.subtype === "company" && !["investor", "backer"].includes(c.role) && !VC_TITLE.test(c.title ?? ""))
    .sort((a, b) => rankCo(b) - rankCo(a)).slice(0, 3);
  const [teams, meHit] = await Promise.all([
    pool(keyCos, 3, (c) => timed(get(`/data/companies/${c.uuid}/team?limit=25`), 5000)),
    meName ? timed(get(`/data/search?q=${enc(meName)}`), 4000).catch(() => null) : null,
  ]);
  const rankP = (p) => (titleRe && titleRe.test(p.title ?? "") ? 5 : 0) + (ROLE_RE.test(p.title ?? "") ? 2 : 0) + (p.is_founder ? 1 : 0);
  const close = keyCos.map((c, i) => ({
    company: { uuid: c.uuid, name: c.name, unicorn: c.unicorn, employees: c.employees, industries: c.industries,
      door: c.industries.some((x) => cust.has(x.id)), angel_title: c.title },
    people: (teams[i]?.data ?? []).map((m) => ({
      uuid: m.person?.uuid ?? m.uuid, name: m.person?.name ?? m.name, title: m.raw_title ?? m.titles?.join(", ") ?? null,
      image: img(m.person?.image ?? m.image), linkedin: m.person?.links?.linkedin ?? m.links?.linkedin ?? null,
      dealroom_url: m.person?.dealroom_url ?? m.dealroom_url, is_founder: Boolean(m.is_founder),
    })).filter((p) => p.uuid && p.uuid !== angelUuid && p.name && !VC_TITLE.test(p.title ?? "") && !/intern|trainee|student/i.test(p.title ?? ""))
      .sort((a, b) => rankP(b) - rankP(a)).slice(0, 5),
  })).filter((g) => g.people.length);

  let me = null, overlaps = [];
  const hit = (meHit?.data ?? []).find((h) => ["person", "founder", "investor"].includes(h.type) && h.name.toLowerCase() === meName.toLowerCase());
  if (hit) {
    const myCareer = ((await timed(get(`/data/people/${hit.uuid}/career?limit=40`), 4000).catch(() => ({ data: [] }))).data ?? []).map(careerItem);
    me = { uuid: hit.uuid, name: hit.name, companies: myCareer.length };
    const angelCos = new Map(angelCareer.map((c) => [c.uuid, c]));
    overlaps = myCareer.filter((c) => angelCos.has(c.uuid)).map((c) => ({ company: c.name, you: c.title ?? ROLE_LABEL[c.role], angel: angelCos.get(c.uuid).title ?? ROLE_LABEL[angelCos.get(c.uuid).role] }));
  }
  const result = { close, me, overlaps };
  if (close.length) pathsMem.set(key, result);
  if (close.length) try { mkdirSync(PATHS_DIR, { recursive: true }); writeFileSync(`${PATHS_DIR}/${key}.json`, JSON.stringify(result)); } catch {}
  return result;
}
