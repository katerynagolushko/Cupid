import { get } from "../dealroom.mjs";
const enc = encodeURIComponent;
const f = `and(investor_type[in_any]:angel,hq_location[in_any]:93,investor_experience_id[in_any]:125403,last_investor_round_date[gte]:2023)`;
const r = await get(`/data/investors?filter=${enc(f)}&view=summary&limit=5`);
const a = r.data[0];
const p = await get(`/data/investors/${a.uuid}/portfolio?limit=5&filter=${enc("taxonomy_id[in_any]:125403")}`);
console.log("PORT", JSON.stringify(p.data[0]).slice(0,700), JSON.stringify(p.page));
const car = await get(`/data/people/${a.uuid}/career?limit=12`);
for (const c of car.data) console.log(JSON.stringify({t:c.raw_title, f:c.is_founder,e:c.is_executive,past:c.is_past, n:c.company.name, ind:c.company.taxonomy?.filter(x=>x.type==="industry").map(x=>x.name), u:c.company.unicorn_type, emp:c.company.employees_count, sub:c.company.subtype, st:c.company.status, cl:c.company.classifications?.map(x=>x.name??x)}));
