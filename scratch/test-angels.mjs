import { findAngels } from "../lib/angels.mjs";
const r = await findAngels({ industry: 125403, industryName: "Health", customers: [125403], region: 93, stage: "Seed", since: 2023 }, { fresh: true });
console.log(r.took_ms, "ms", r.stats);
for (const a of r.angels.slice(0, 10)) console.log(a.score, JSON.stringify(a.parts), a.name, "|", a.why.join(" · "));
console.log("hubs", r.hubs.slice(0,8).map(h=>`${h.name}(${h.angels.length})`).join(", "));
