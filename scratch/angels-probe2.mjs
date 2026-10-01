import { get } from "../dealroom.mjs";
const enc = encodeURIComponent;
const f = `and(investor_type[in_any]:angel,hq_location[in_any]:93,investor_experience_id[in_any]:125403,last_investor_round_date[gte]:2023)`;
const r = await get(`/data/investors?filter=${enc(f)}&view=summary&limit=10&include_total=true`);
console.log("total", r.page.total, r.data.map(x=>x.name));
console.log("investor block", JSON.stringify(r.data[0].investor).slice(0,1500));
for (const a of r.data.slice(0,4)) {
  const car = await get(`/data/people/${a.uuid}/career?limit=20`);
  console.log("\n##", a.name, car.data.length);
  for (const c of car.data.slice(0,6)) console.log(" -", c.titles?.join("/"), "|", c.company?.name, "| keys:", Object.keys(c.company||{}).join(","));
}
