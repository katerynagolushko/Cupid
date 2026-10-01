// Feasibility probe: how complete are investor "thesis" fields, and what does a portfolio row look like?
import { get } from "../dealroom.mjs";

const enc = encodeURIComponent;
const f = "and(hq_location[in_any]:233,investor_type[in_any]:venture_capital,investor_experience_id[in_any]:125403,last_investor_round_date[gte]:2025)";
const page = await get(`/data/investors?filter=${enc(f)}&view=summary&limit=100&include_total=true`);
const rows = page.data;
const pct = (fn) => `${Math.round((100 * rows.filter(fn).length) / rows.length)}%`;
console.log(`US VCs with health experience, active since 2025: total ${page.page.total}, sampled ${rows.length}`);
console.table({
  about_text: pct((r) => r.about?.length > 50),
  website_domain: pct((r) => r.domain),
  stages: pct((r) => r.stages?.length),
  deal_size: pct((r) => r.deal_size?.max > 0),
  preferred_round: pct((r) => r.investments?.preferred_round),
  last_round_date: pct((r) => r.investments?.last_round_date),
});

const sample = rows.find((r) => r.stages?.length && r.deal_size?.max > 0) ?? rows[0];
console.log("Sample:", JSON.stringify({ name: sample.name, stages: sample.stages, deal_size: sample.deal_size, investments: sample.investments }));
const pf = await get(`/data/investors/${sample.uuid}/portfolio?limit=3`);
console.log("Portfolio row keys:", Object.keys(pf.data[0] ?? {}).join(", "));
console.log("Portfolio row:", JSON.stringify(pf.data[0]).slice(0, 1200));
