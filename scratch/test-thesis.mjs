// Smoke test for lib/thesis.mjs. Usage: node scratch/test-thesis.mjs [--fresh] [--verbose]
import { fetchStatedThesis, compareThesis } from '../lib/thesis.mjs';

const fresh = process.argv.includes('--fresh');
const verbose = process.argv.includes('--verbose');

const INVESTORS = [
  ['Techstars', 'techstars.com'],
  ['Y Combinator', 'ycombinator.com'],
  ['SOSV', 'sosv.com'],
  ['Ascension Ventures', 'ascensionventures.org'],
  ['Zetta Venture Partners', 'zettavp.com'],
  ['LDV Capital', 'ldv.co'],
  ['OMX Ventures', 'omxventures.com'],
  ['Plug and Play', 'plugandplaytechcenter.com'],
  ['Seedcamp', 'seedcamp.com'],
];

// Illustrative revealed block (not real Dealroom numbers) so every verdict path is exercised.
const REVEALED = { stages: { Seed: 4, 'Pre-Seed': 2 }, industry_deals: 6, region_deals: 6, leads: 1, last_deal: '2026-08' };
const QUERY = { industryName: 'Health', stages: ['Pre-Seed', 'Seed'], regionName: 'United Kingdom', since: 2024 };

const fmtMoney = (n) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const t0 = Date.now();
const results = await Promise.all(INVESTORS.map(async ([name, domain]) => {
  const s0 = Date.now();
  const stated = await fetchStatedThesis({ name, domain, about: null, refresh: fresh });
  return { name, domain, stated, ms: Date.now() - s0 };
}));

const rows = results.map(({ domain, stated, ms }) => ({
  domain,
  method: stated.method,
  pages: stated.source_urls.filter((u) => u.startsWith('http')).length,
  ms,
  stages: stated.stages.join(',') || '-',
  sectors: cut(stated.sectors.join(',') || '-', 48),
  geos: stated.geographies.join(',') || '-',
  cheque: stated.cheque ? `${fmtMoney(stated.cheque.min)}-${fmtMoney(stated.cheque.max)}` : '-',
}));
console.table(rows);
console.log(`total wall time ${Date.now() - t0}ms${fresh ? ' (fresh)' : ''}\n`);

for (const { name, stated } of results) {
  const v = compareThesis(stated, REVEALED, QUERY);
  console.log(`${name}: stage=${v.stage} sector=${v.sector} geo=${v.geography}\n  ${v.summary}`);
  if (verbose) {
    console.log(`  sources: ${stated.source_urls.join(' ')}`);
    for (const q of stated.quotes) console.log(`  “${q}”`);
    if (process.argv.includes('--evidence') && stated.evidence) {
      for (const [k, v] of Object.entries(stated.evidence)) console.log(`    [${k}] ${v.join(' ‖ ')}`);
    }
    if (stated.errors?.length) console.log(`  errors: ${stated.errors.map((e) => `${e.url} ${e.error}`).join('; ')}`);
  }
}

console.log('\nUS-only example:');
console.log(' ', compareThesis({ stages: ['Seed'], sectors: ['Health'], geographies: ['US'] }, { stages: { Seed: 3 }, industry_deals: 3, region_deals: 3, leads: 0 }, QUERY).summary);

const failed = results.filter((r) => r.stated.method === 'unavailable' || r.stated.source_urls.filter((u) => u.startsWith('http')).length === 0);
console.log(`\nFailed (no website text): ${failed.map((r) => r.domain).join(', ') || 'none'}`);
