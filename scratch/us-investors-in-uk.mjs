// Feasibility probe: which US-HQ investors back UK health pre-seed/seed rounds?
// Run from repo root: node scratch/us-investors-in-uk.mjs
import { get } from "../dealroom.mjs";

const enc = encodeURIComponent;
const roundFilter =
  "and(hq_location[in_any]:93,taxonomy_id[in_any]:125403,standardized_round[in_any]:Seed|Pre-Seed,year[gte]:2024,is_vc_round[eq]:true)";

const rounds = [];
let cursor = null;
do {
  const page = await get(`/data/transactions?filter=${enc(roundFilter)}&limit=100&sort=-date${cursor ? `&cursor=${enc(cursor)}` : ""}`);
  rounds.push(...page.data);
  cursor = page.page?.next_cursor;
} while (cursor);

const byInvestor = new Map();
for (const r of rounds) {
  for (const { investor, is_lead } of r.investors ?? []) {
    if (!investor?.uuid) continue;
    const e = byInvestor.get(investor.uuid) ?? { name: investor.name, deals: 0, leads: 0, companies: new Set() };
    e.deals++; if (is_lead) e.leads++; e.companies.add(r.company?.name);
    byInvestor.set(investor.uuid, e);
  }
}

const uuids = [...byInvestor.keys()];
const us = [];
for (let i = 0; i < uuids.length; i += 50) {
  const f = `and(id[in_any]:${uuids.slice(i, i + 50).join("|")},hq_location[in_any]:233)`;
  const page = await get(`/data/investors?filter=${enc(f)}&view=summary&limit=50`);
  us.push(...page.data);
}

console.log(`UK health pre-seed/seed VC rounds since 2024: ${rounds.length}`);
console.log(`Distinct investors: ${uuids.length}, of which US-HQ: ${us.length}`);
console.table(
  us.map((i) => ({ ...byInvestor.get(i.uuid), uuid: i.uuid }))
    .sort((a, b) => b.deals - a.deals)
    .slice(0, 15)
    .map(({ name, deals, leads, companies }) => ({ name, deals, leads, companies: [...companies].slice(0, 3).join(", ") })),
);
console.log("Sample US investor row keys:", us[0] && Object.keys(us[0]).join(", "));
