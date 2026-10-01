// "Says vs Does": scrape an investor's stated thesis from its website and compare
// it with revealed behaviour from Dealroom rounds. Standard library only.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (compatible; CrossThePond/1.0; +https://dealroom.co)';
const PAGE_TIMEOUT_MS = 6000;
const TOTAL_BUDGET_MS = 12000;
const LLM_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), 'cache', 'thesis');
const MAX_SUBPAGES = 4;

export const STAGES = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'];
export const GEOGRAPHIES = ['US', 'UK', 'Europe', 'Global', 'Israel', 'Asia', 'LatAm', 'Africa'];

const STAGE_PATTERNS = [
  ['Pre-Seed', /\bpre[\s\-–]?seed\b/gi],
  ['Seed', /(?<!pre[\s\-–]?)\bseed(?:[\s\-–](?:stage|round|funding|investment|capital|investor|fund|check|cheque)s?)?\b(?![\s\-–]?camp)/gi],
  ['Series A', /\bseries[\s\-–]?a\b/gi],
  ['Series B', /\bseries[\s\-–]?b\b/gi],
  ['Series C+', /\bseries[\s\-–]?[c-f]\b|\bseries[\s\-–]?c\+/gi],
  ['Growth', /\bgrowth[\s\-–](?:stage|equity|capital|rounds?|investments?|investing|fund(?:s|ing)?)\b|\blate[\s\-–]stage\b|\bpre[\s\-–]ipo\b/gi],
];
const EARLY_STAGE = /\bearly[\s\-–]stages?\b|\bfirst[\s\-–](?:check|cheque)\s+investors?\b|\bfirst\s+(?:institutional\s+)?(?:backer|investor)s?\b/gi;
const VERY_EARLY = /\b(?:very\s+)?earliest[\s\-–]stages?\b|\bidea[\s\-–]stage\b|\bzero[\s\-–]to[\s\-–]one\b|\bpre[\s\-–](?:product|revenue|inc(?:orporation)?)\b/gi;
const FOLLOW_ON = /\bfollow[\s\-–]?ons?\b|\bsubsequent\s+rounds\b|\blater\s+rounds\b|\bpro[\s\-–]?rata\b|\bselect\s+fund\b|\bopportunity\s+fund\b/i;

const SECTOR_PATTERNS = [
  ['Health', /\bhealth[\s\-]?care\b|\bhealth[\s\-]?tech\b|\bmed[\s\-]?tech\b|\bbio[\s\-]?tech(?:nology)?\b|\blife[\s\-]sciences?\b|\bdigital[\s\-]health\b|\btherapeutics?\b|\bpharma(?:ceuticals?)?\b|\bhealth\b|\bmedical\b|\bmedicine\b|\bbiology\b|\bdiagnostics\b/gi],
  ['Fintech', /\bfin[\s\-]?tech\b|\bfinancial[\s\-]services\b|\bpayments?\b|\binsur[\s\-]?tech\b|\bembedded[\s\-]finance\b|\bwealth[\s\-]?tech\b|\bbanking\b/gi],
  ['Enterprise Software', /\bsaas\b|\bb2b[\s\-](?:software|saas|ai|tech|startups?|companies)\b|\benterprise[\s\-](?:software|saas|ai|tech(?:nology)?|infrastructure|applications?)\b|\bdev[\s\-]?tools\b|\bdeveloper[\s\-](?:tools|tooling|platforms?|infrastructure)\b|\bai[\s\-]infrastructure\b|\bdata[\s\-]infrastructure\b|\binfrastructure[\s\-]software\b|\bai[\s\-](?:first|native)\b|\bapplied[\s\-]ai\b|\bmachine[\s\-]learning\b|\bartificial[\s\-]intelligence\b|\bcloud[\s\-](?:software|infrastructure)\b|\bb2b\b/gi],
  ['Energy', /\benergy\b|\bclimate(?:[\s\-]?tech)?\b|\bclean[\s\-]?tech\b|\bdecarboni[sz](?:e|ation|ing)\b|\brenewables?\b|\bnet[\s\-]zero\b/gi],
  ['Food', /\bfood(?:[\s\-]?tech)?\b|\bag[\s\-]?tech\b|\bagri[\s\-]?(?:food|tech|culture)\b|\bagriculture\b/gi],
  ['Education', /\bed[\s\-]?tech\b|\beducation(?:al)?\b/gi],
  ['Security', /\bcyber[\s\-]?security\b|\bcyber\b|\binfosec\b|\bsecurity\b/gi],
  ['Robotics', /\brobot(?:ic|ics|s)?\b/gi],
  ['Space', /\bspace[\s\-]?tech\b|\baerospace\b|\bsatellites?\b|\bnew[\s\-]space\b|\bspace[\s\-]economy\b/gi],
  ['Semiconductors', /\bsemiconductors?\b|\bchip[\s\-]design\b|\bsilicon[\s\-](?:photonics|design)\b/gi],
  ['Transportation', /\bmobility\b|\btransport(?:ation)?\b|\blogistics\b|\bautomotive\b|\bautonomous[\s\-]vehicles?\b/gi],
  ['Real Estate', /\bprop[\s\-]?tech\b|\breal[\s\-]estate\b|\bconstruction[\s\-]?tech\b/gi],
  ['Media', /\bmedia[\s\-]?tech\b|\bdigital[\s\-]media\b|\bmedia\s(?:and|&)\sentertainment\b|\bcreator[\s\-]economy\b|\bentertainment\b/gi],
  ['Gaming', /\bgaming\b|\bvideo[\s\-]games?\b|\besports\b|\bgames\b/gi],
  ['Legal', /\blegal[\s\-]?tech\b|\blegal[\s\-]services\b|\blaw[\s\-]firms?\b/gi],
  ['Marketing', /\bmar[\s\-]?tech\b|\bmarketing[\s\-](?:tech|technology|software)\b|\bad[\s\-]?tech\b|\badvertising\b/gi],
  ['Jobs Recruitment', /\bhr[\s\-]?tech\b|\brecruit(?:ment|ing)\b|\bfuture[\s\-]of[\s\-]work\b|\bhiring[\s\-]platforms?\b|\bworkforce\b/gi],
  ['Telecom', /\btelecom(?:munications|s)?\b|\bconnectivity\b|\b5g\b|\bwireless\b/gi],
];
const SECTOR_NAMES = SECTOR_PATTERNS.map(([n]) => n);

// Case-sensitive where the acronym collides with an English word ("us", "uk" in URLs).
const GEO_PATTERNS = [
  ['US', [/\bunited[\s\-]states\b/gi, /\bnorth[\s\-]america(?:n)?\b/gi, /\bU\.S\.(?:A\.)?/g, /\bUSA\b/g,
    /\bUS(?=[\s\-](?:based|founders?|startups?|companies|market|entrepreneurs|tech|ecosystem|only)\b)/g,
    /\b(?:in|across|throughout)\s+(?:the\s+)?US\b/g, /\bsilicon\s+valley\b/gi, /\bbay\s+area\b/gi, /\bAmerican\s+(?:founders?|startups?|companies|entrepreneurs)\b/gi]],
  ['UK', [/(?<!college\s)\blondon\b/gi, /\bunited[\s\-]kingdom\b/gi, /\bUK\b/g, /\bbritain\b/gi, /\bbritish\b/gi]],
  ['Europe', [/\beurope\b/gi, /\beuropean\b/gi, /\bEU\b/g]],
  ['Global', [/\bglobally\b/gi, /\bglobal\s+(?:\w+\s+)?(?:founders?|startups?|companies|investors?|fund|venture|vc|accelerator|portfolio|footprint|reach|network|scale|presence|platform)\b/gi,
    /\bworld[\s\-]?wide\b/gi, /\banywhere\b/gi, /\baround\s+the\s+(?:world|globe)\b/gi, /\bacross\s+the\s+(?:world|globe)\b/gi, /\ball\s+over\s+the\s+world\b/gi, /\bevery\s+(?:country|continent)\b/gi]],
  ['Israel', [/\bisrael(?:i)?\b/gi, /\btel[\s\-]aviv\b/gi]],
  ['Asia', [/\basia(?:n)?\b/gi, /\bindia\b/gi, /\bsingapore\b/gi, /\bjapan\b/gi, /\bsoutheast\s+asia\b/gi, /\bchina\b/gi]],
  ['LatAm', [/\blatin[\s\-]america\b/gi, /\blatam\b/gi, /\bbrazil\b/gi, /\bmexico\b/gi]],
  ['Africa', [/\bafrica(?:n)?\b/gi, /\bnigeria\b/gi, /\bkenya\b/gi]],
];

// Lines describing portfolio news ("X raised a $20M Series B") are not thesis.
const NEWS = /\b(?:raised|raises|raising|raise|announc\w*|closes|closed|acquired|acquisition|acquires|acq\.|ipo'?d|went public|exit(?:ed|s)?|led by|leads|co-leads|co-led|participation from|valued at|congratulations|funding round|round of funding)\b/i;
// A sentence only counts as "stated thesis" if it reads like the investor describing itself.
const SELF_REF = /\b(?:we|our)\b/i;
const THESIS_VERB = /\b(?:invest(?:s|ing|ed|ments?)?|back(?:s|ing|er)?|fund(?:s|ing|ed)?|partner(?:s|ing)?\s+with|focus\w*|support\w*|look(?:ing)?\s+for|work(?:ing)?\s+with|speciali[sz]\w*|lead|co-lead|write|cheques?|checks?|accept\w*|seek\w*|target\w*|open\s+to)\b/i;
const THESIS_PHRASE = new RegExp([
  /\binvest(?:s|ing|ments?)?\s+(?:\w+\s+){0,3}(?:in|at|across|from|horizontally|globally)\b/,
  /\bfocus(?:ed|es|ing)?\s+on\b/, /\bthesis\b/, /\bsector[\s-]agnostic\b/,
  /\bstage\s+(?:venture|vc|investor|fund|firm|capital)/,
  /\b(?:vc|venture(?:\s+capital)?)\s+(?:firm|fund|investor|partner)s?\b/,
  /\b(?:provides?|offers?)\b[^.]{0,60}\b(?:funding|capital|investment)\b/,
  /\baccelerator\b[^.]{0,40}\b(?:for|investing)\b/,
  /\b(?:capital|believers?|investors?|backers?|funding)\s+(?:[\w-]+\s+){0,3}(?:for|in|to)\s+(?:[\w-]+\s+){0,4}(?:startups?|founders?|companies|builders?|teams|entrepreneurs)\b/,
].map((r) => r.source).join('|'), 'i');
const LABEL = /^(?:stages?|sectors?|geograph(?:y|ies)|focus(?:\s+areas?)?|industr(?:y|ies)|regions?|check\s+size|cheque\s+size|ticket(?:\s+size)?|invest(?:ment)?(?:\s+size)?|we\s+invest)\s*[:–-]/i;
const BOILERPLATE = /\bsecurities\b|\bthe\s+act\b|accredited\s+investor|\bpursuant\b|\bherein\b|terms\s+of\s+(?:use|service)|\bcookies?\b|\bprivacy\b|registered\s+(?:number|office)|regulated\s+by|limited\s+liability|all\s+rights\s+reserved|sign\s+up|newsletter|subscribe/i;
const TESTIMONIAL = /^["'“‘]|\b(?:helped|helping|took\s+a\s+chance\s+on|believed\s+in|backed)\s+us\b|\bthey['’]ve\b|\bthey\s+have\s+been\b|\bco-?investors\s+(?:include|across)|^co-?investors\b|\blimited\s+partners\b|\bLPs\b/i;
const NEWS_AMOUNT = /[$£€]\s?\d[\d.,]*\s?(?:k|m|mn|million|bn|b)\b\s+(?:pre[\s\-–]?seed|seed|series|round|funding)|\binvestment\s+in\s+\S+['’]s\b/i;
const AGNOSTIC = /\bsector[\s-]agnostic\b|\bindustry[\s-]agnostic\b|\bgeneralists?\b|\b(?:across|in)\s+(?:all|any|every)\s+(?:sectors?|industr(?:y|ies)|verticals?)\b/i;
const NEGATION = /\b(?:do(?:es)?\s+not|don['’]t|doesn['’]t|never|won['’]t|not)\s+(?:typically\s+|currently\s+)?(?:invest|back|fund|consider|look\s+at)\b|\bexclud\w*|\bout\s+of\s+scope\b/i;
const QUOTE_VERB = /\b(?:invest\w*|back\w*|partner\w*|fund\w*)\b/i;
const CHEQUE_CTX = /\b(?:cheques?|checks?|invest\w*|tickets?|initial|first)\b/i;
const FUND_CTX = /\b(?:funds?|aum|under\s+management|raised|raising|valuation|valued|capital\s+commitments?|billion|bn)\b/i;
const FX_TO_USD = { '$': 1, '£': 1.27, '€': 1.08 };

const memoryCache = new Map();

/* ------------------------------------------------------------------ helpers */

function normaliseDomain(domain) {
  if (!domain) return '';
  let d = String(domain).trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : '';
}

function bareHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', hellip: '…', pound: '£', euro: '€', dollar: '$', copy: '©', reg: '®', trade: '™',
  middot: '·', bull: '•', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', shy: '',
  zwj: '', zwnj: '', thinsp: ' ', ensp: ' ', emsp: ' ', plus: '+', colon: ':', comma: ',', period: '.', excl: '!', quest: '?',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : ' '; } catch { return ' '; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function metaDescriptions(html) {
  const out = [];
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (!/(?:name|property)\s*=\s*["'](?:description|og:description|twitter:description)["']/i.test(tag)) continue;
    const c = tag.match(/content\s*=\s*(["'])([\s\S]*?)\1/i);
    if (c && c[2].trim()) out.push(decodeEntities(c[2]).trim());
  }
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t && t[1].trim()) out.unshift(decodeEntities(t[1].replace(/<[^>]+>/g, '')).trim());
  return [...new Set(out)];
}

export function htmlToText(html) {
  let s = String(html || '');
  const meta = metaDescriptions(s);
  s = s
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|iframe|canvas|template|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/?(?:p|div|section|article|header|footer|nav|aside|main|h[1-6]|li|ul|ol|tr|td|th|table|blockquote|figcaption|button|form|label|dt|dd|option|summary|details)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  const seen = new Set();
  const lines = [];
  for (const raw of [...meta, ...s.split(/\n+/)]) {
    const line = raw.replace(/[\s\u00a0\u200b]+/g, ' ').trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines.join('\n');
}

function looksLikeBotWall(html) {
  const head = html.slice(0, 20000);
  return /just a moment\.\.\.|cf-challenge|challenge-platform|attention required! \| cloudflare|enable javascript and cookies to continue|verifying you are human|access denied|captcha-delivery|perimeterx/i.test(head)
    && html.length < 200000;
}

async function fetchPage(url, timeoutMs) {
  if (timeoutMs < 500) return { url, error: 'budget exhausted' };
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') || '';
    if (ct && !/html|text\/plain|xml/i.test(ct)) return { url, error: `content-type ${ct}` };
    const html = (await res.text()).slice(0, 2_000_000);
    if (looksLikeBotWall(html)) return { url: res.url || url, error: 'bot wall' };
    return { url: res.url || url, html };
  } catch (err) {
    return { url, error: err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code || err?.message || 'fetch failed') };
  }
}

const LINK_KEYWORDS = [
  [/thesis/, 10], [/approach/, 9], [/focus/, 8], [/what[\s\-_]?we[\s\-_]?do/, 8], [/strategy/, 7], [/faqs?\b/, 7],
  [/invest(?!ors?\b)/, 6], [/\bdeal\b|(?:investment|deal)[\s\-_]terms|criteria/, 6], [/about/, 5], [/apply/, 4], [/investors?\b/, 3], [/portfolio/, 2],
];

function pickThesisLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const host = bareHost(base.hostname);
  const scored = new Map();
  const re = /<a\b([^>]*?)href\s*=\s*(["'])([^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[3].trim());
    if (!href || /^(?:mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let u;
    try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || bareHost(u.hostname) !== host) continue;
    if (/\.(?:pdf|jpe?g|png|gif|svg|webp|zip|mp4|mov|docx?|xlsx?|pptx?)$/i.test(u.pathname)) continue;
    u.hash = '';
    u.search = '';
    const key = u.href.replace(/\/$/, '');
    if (key === base.origin || u.pathname === '/' || u.pathname === '') continue;
    const text = m[5].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const pathLower = decodeURIComponent(u.pathname).toLowerCase();
    let score = 0;
    for (const [kw, w] of LINK_KEYWORDS) {
      if (kw.test(pathLower)) score = Math.max(score, w + 1);
      else if (kw.test(text)) score = Math.max(score, w);
    }
    if (!score) continue;
    const depth = pathLower.split('/').filter(Boolean).length;
    if (depth > 2) score -= 4;
    if (/\b(?:blog|news|newsroom|press|posts?|insights|stories|views|articles?|podcasts?|people|team|jobs|careers|events?)\b/.test(pathLower)) score -= 5;
    if (/terms-of|legal|privacy|cookie|disclaimer|policy|login|sign-?in|investor-portal|lp-portal/.test(pathLower)) continue;
    if (pathLower.split('/').some((seg) => seg.length > 30 || seg.split('-').length > 4)) score -= 5;
    if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?)\//.test(pathLower) && !/^\/(?:us|uk)\//.test(pathLower)) score -= 3;
    if (score <= 0) continue;
    const prev = scored.get(key);
    if (!prev || prev.score < score) scored.set(key, { url: u.href, score });
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, MAX_SUBPAGES).map((x) => x.url);
}

function splitSentences(text) {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘(])/)) {
      const t = s.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function countMatches(re, text) {
  re.lastIndex = 0;
  const m = text.match(re);
  return m ? m.length : 0;
}

/* --------------------------------------------------------- keyword extraction */

function parseAmount(sym, num, unit) {
  let n = parseFloat(String(num).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const u = (unit || '').toLowerCase();
  if (u === 'k' || u === 'thousand') n *= 1e3;
  else if (u === 'm' || u === 'mm' || u === 'mn' || u === 'million') n *= 1e6;
  else if (u === 'b' || u === 'bn' || u === 'billion') n *= 1e9;
  else if (n < 10000) return null; // bare "$5" etc. is not a cheque
  return Math.round(n * (FX_TO_USD[sym] || 1));
}

function extractCheque(texts) {
  const amounts = [];
  const re = /(US\$|\$|£|€)\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|mm|mn|m|million|thousand|bn|b|billion)?(?![a-z])/gi;
  for (const text of texts) {
    const flat = text.replace(/\n+/g, ' ');
    let m;
    while ((m = re.exec(flat))) {
      const sym = m[1].toUpperCase() === 'US$' ? '$' : m[1];
      const usd = parseAmount(sym, m[2], m[3]);
      if (usd == null || usd < 10000 || usd > 50_000_000) continue;
      const near = flat.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      const tight = flat.slice(Math.max(0, m.index - 45), m.index + m[0].length + 30);
      if (!CHEQUE_CTX.test(near)) continue;
      if (FUND_CTX.test(tight.replace(/\bfund(?:s|ing)?\s+(?:founders?|startups?|companies|teams)\b/gi, ''))) continue;
      if (NEWS.test(tight)) continue;
      amounts.push(usd);
    }
  }
  if (!amounts.length) return null;
  return { min: Math.min(...amounts), max: Math.max(...amounts) };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stageIndex(raw) {
  const t = raw.toLowerCase().replace(/[\s\-–]+/g, '');
  if (t === 'preseed') return 0;
  if (t === 'seed') return 1;
  if (t === 'seriesa') return 2;
  if (t === 'seriesb' || t === 'seriesb+') return 3;
  if (/^series[c-f]\+?$/.test(t)) return 4;
  if (t === 'growth') return 5;
  return -1;
}

// "pre-seed to Series A" / "seed through Series B" also implies the stages in between.
const STAGE_RANGE = /\b(pre[\s\-–]?seed|seed|series[\s\-–]?[a-f])\s*(?:to|through|thru|until|–|—|-)\s*(?:the\s+)?(seed|series[\s\-–]?[a-f]\+?|growth)\b/gi;

function extractKeyword(sources, name) {
  const web = sources.filter((s) => s.kind === 'web');
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const initials = words.length >= 2 ? words.map((w) => w[0]).join('') : '';
  const nameAlts = [words.join(' '), words[0] || '', initials].filter((n) => n.length >= 2 && !/^(?:the|and)$/i.test(n));
  const nameRe = nameAlts.length ? new RegExp(`\\b(?:${nameAlts.map(escapeRe).join('|')})\\b`, 'i') : null;
  const all = sources.flatMap((s) => splitSentences(s.text).map((t) => ({ t, src: s })));

  const isThesis = (x) => {
    const t = x.t;
    if (NEGATION.test(t) || BOILERPLATE.test(t) || TESTIMONIAL.test(t)) return false;
    if (LABEL.test(t)) return true;
    if (NEWS_AMOUNT.test(t)) return false;
    if (NEWS.test(t) && !/\b(?:we|our)\s+(?:invest|back|lead|fund)/i.test(t)) return false;
    if (x.src.meta?.has(t)) return true;
    if (t.split(/\s+/).length < 5 || t.length > 600) return false;
    if (x.src.kind === 'about') return true;
    return ((SELF_REF.test(t) || (nameRe && nameRe.test(t))) && THESIS_VERB.test(t)) || THESIS_PHRASE.test(t);
  };
  const usable = all.filter(isThesis);
  const negated = all.filter((x) => NEGATION.test(x.t) && x.t.length < 400);
  const joined = usable.map((x) => x.t).join('\n');
  const stageText = usable.filter((x) => !FOLLOW_ON.test(x.t)).map((x) => x.t).join('\n');

  const stageSet = new Set(STAGE_PATTERNS.filter(([, re]) => countMatches(re, stageText) > 0).map(([n]) => n));
  STAGE_RANGE.lastIndex = 0;
  for (const m of stageText.matchAll(STAGE_RANGE)) {
    const a = stageIndex(m[1]), b = stageIndex(m[2]);
    if (a >= 0 && b > a) for (let i = a; i <= b; i++) stageSet.add(STAGES[i]);
  }
  if (countMatches(VERY_EARLY, stageText) > 0) stageSet.add('Pre-Seed');
  if (!stageSet.size && countMatches(EARLY_STAGE, stageText) > 0) stageSet.add('Seed');
  if (stageSet.size === 1 && stageSet.has('Pre-Seed') && countMatches(EARLY_STAGE, stageText) > 0) stageSet.add('Seed');
  const stages = STAGES.filter((s) => stageSet.has(s));

  const excluded = new Set();
  for (const x of negated) for (const [n, re] of SECTOR_PATTERNS) if (countMatches(re, x.t)) excluded.add(n);

  const sectorScore = new Map();
  for (const x of usable) {
    const w = x.src.portfolio ? 0.5 : 1;
    for (const [n, re] of SECTOR_PATTERNS) {
      if (countMatches(re, x.t)) sectorScore.set(n, (sectorScore.get(n) || 0) + w);
    }
  }
  const sectors = [...sectorScore.entries()].filter(([n, s]) => s >= 1 && !excluded.has(n)).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const sector_agnostic = usable.some((x) => AGNOSTIC.test(x.t));

  const geoText = usable.filter((x) => !/\bincorporat\w*|\bflip\b|\bvisas?\b|\boffices?\b|\bheadquarter/i.test(x.t)).map((x) => x.t).join('\n');
  const geographies = [];
  for (const [g, res] of GEO_PATTERNS) {
    if (res.some((re) => countMatches(re, geoText) > 0)) geographies.push(g);
  }

  const cheque = extractCheque([joined]);

  const kwRes = [...STAGE_PATTERNS.map(([, r]) => r), EARLY_STAGE, ...SECTOR_PATTERNS.map(([, r]) => r), ...GEO_PATTERNS.flatMap(([, r]) => r)];
  const candidates = [];
  const seen = new Set();
  for (const x of usable) {
    const t = x.t;
    if (t.length < 30 || t.length > 220 || !QUOTE_VERB.test(t) || /[|]{1}|©|cookie|privacy/i.test(t)) continue;
    const hits = kwRes.reduce((n, re) => n + (countMatches(re, t) ? 1 : 0), 0);
    if (!hits) continue;
    const key = t.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const words = t.split(/\s+/).length;
    const score = hits * 2 + (x.src.kind === 'web' ? 3 : 0) + (/\b(?:we|our)\b/i.test(t) ? 2 : 0) + (words >= 8 ? 1 : -2) + (x.src.portfolio ? -3 : 0) + (FOLLOW_ON.test(t) ? -4 : 0);
    candidates.push({ t, score });
  }
  const quotes = candidates.sort((a, b) => b.score - a.score).slice(0, 3).map((c) => c.t);

  const evidence = {};
  const note = (k, t) => { (evidence[k] ||= []).length < 3 && evidence[k].push(cut(t, 140)); };
  for (const x of usable) {
    for (const [n, re] of STAGE_PATTERNS) if (countMatches(re, x.t)) note(n, x.t);
    for (const [n, re] of SECTOR_PATTERNS) if (countMatches(re, x.t)) note(n, x.t);
    for (const [n, res] of GEO_PATTERNS) if (res.some((re) => countMatches(re, x.t))) note(n, x.t);
  }

  return { stages, sectors, sector_agnostic, geographies, cheque, quotes, evidence, _webPages: web.length };
}

/* ----------------------------------------------------------------- LLM mode */

const LLM_KEYS = ['XAI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
let llmKeysPromise = null;

function loadLlmKeys() {
  if (!llmKeysPromise) {
    llmKeysPromise = (async () => {
      const keys = {};
      for (const k of LLM_KEYS) if (process.env[k]) keys[k] = process.env[k];
      try {
        const raw = await readFile(path.join(process.cwd(), '.env'), 'utf8');
        for (const line of raw.split(/\r?\n/)) {
          const m = line.match(/^\s*(?:export\s+)?(XAI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\s*=\s*(.*)\s*$/);
          if (!m || keys[m[1]]) continue;
          const v = m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
          if (v) keys[m[1]] = v;
        }
      } catch { /* no .env */ }
      return keys;
    })();
  }
  return llmKeysPromise;
}

function llmPrompt(name, text) {
  return `You extract an investor's STATED investment thesis from its own website text.
Investor: ${name || 'unknown'}
Return ONLY a JSON object with exactly these keys:
{"stages": [subset of ${JSON.stringify(STAGES)}],
 "sectors": [subset of ${JSON.stringify(SECTOR_NAMES)}],
 "geographies": [subset of ${JSON.stringify(GEOGRAPHIES)}],
 "cheque": {"min": number_usd, "max": number_usd} or null,
 "quotes": [up to 3 verbatim sentences under 220 characters from the text that state the thesis]}
Rules: only include what the text explicitly states about what the investor backs. Ignore portfolio company news (e.g. "X raised a Series B"). Cheque is the investor's own typical cheque, not fund size; convert GBP x1.27 and EUR x1.08. Use [] when unknown.

TEXT:
${text}`;
}

async function callLlm(keys, name, text) {
  const prompt = llmPrompt(name, text);
  const signal = AbortSignal.timeout(LLM_TIMEOUT_MS);
  let content;
  if (keys.XAI_API_KEY || keys.OPENAI_API_KEY) {
    const xai = !!keys.XAI_API_KEY;
    const res = await fetch(xai ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${xai ? keys.XAI_API_KEY : keys.OPENAI_API_KEY}`, 'User-Agent': UA },
      body: JSON.stringify({
        model: xai ? 'grok-3-mini' : 'gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'system', content: 'You return strict JSON only.' }, { role: 'user', content: prompt }],
        ...(xai ? {} : { response_format: { type: 'json_object' } }),
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const j = await res.json();
    content = j?.choices?.[0]?.message?.content;
  } else {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': keys.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'User-Agent': UA },
      body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 800, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const j = await res.json();
    content = j?.content?.map((c) => c.text || '').join('');
  }
  const jsonText = String(content || '').match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error('LLM returned no JSON');
  return JSON.parse(jsonText);
}

function canon(list, vocab, aliases = {}) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const s = String(raw || '').trim();
    const lower = s.toLowerCase();
    const hit = vocab.find((v) => v.toLowerCase() === lower) || aliases[lower.replace(/[^a-z+]/g, '')];
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

function normaliseLlm(j) {
  const stages = canon(j.stages, STAGES, { preseed: 'Pre-Seed', seed: 'Seed', seriesa: 'Series A', seriesb: 'Series B', seriesc: 'Series C+', seriesd: 'Series C+', latestage: 'Growth', growthstage: 'Growth', earlystage: 'Seed' });
  const sectors = canon(j.sectors, SECTOR_NAMES, { healthcare: 'Health', biotech: 'Health', healthtech: 'Health', saas: 'Enterprise Software', b2bsoftware: 'Enterprise Software', enterprise: 'Enterprise Software', ai: 'Enterprise Software', climate: 'Energy', cleantech: 'Energy', edtech: 'Education', cybersecurity: 'Security', mobility: 'Transportation', proptech: 'Real Estate', jobs: 'Jobs Recruitment', recruitment: 'Jobs Recruitment', hrtech: 'Jobs Recruitment' });
  const geographies = canon(j.geographies, GEOGRAPHIES, { unitedstates: 'US', usa: 'US', northamerica: 'US', unitedkingdom: 'UK', european: 'Europe', eu: 'Europe', worldwide: 'Global', latinamerica: 'LatAm' });
  let cheque = null;
  const min = Number(j?.cheque?.min), max = Number(j?.cheque?.max);
  if (Number.isFinite(min) && min > 0 && min <= 50e6) cheque = { min, max: Number.isFinite(max) && max >= min && max <= 50e6 ? max : min };
  const quotes = (Array.isArray(j.quotes) ? j.quotes : []).map(String).filter((q) => q.length && q.length <= 220).slice(0, 3);
  return { stages, sectors, geographies, cheque, quotes };
}

/* ------------------------------------------------------------------- caching */

function cachePath(domain) {
  return path.join(CACHE_DIR, `${domain.replace(/[^a-z0-9.-]/g, '_')}.json`);
}

async function readDiskCache(domain) {
  try {
    const file = cachePath(domain);
    const st = await stat(file);
    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) return null;
    const j = JSON.parse(await readFile(file, 'utf8'));
    return j && Array.isArray(j.stages) ? j : null;
  } catch {
    return null;
  }
}

async function writeDiskCache(domain, value) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath(domain), JSON.stringify(value, null, 2));
  } catch { /* cache is best effort */ }
}

/* ------------------------------------------------------------------ main API */

function emptyResult(source_urls = [], method = 'unavailable') {
  return { source_urls, fetched_at: new Date().toISOString(), method, stages: [], sectors: [], sector_agnostic: false, geographies: [], cheque: null, quotes: [] };
}

async function scrape(domain) {
  const started = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - started);
  const pages = [];
  const errors = [];
  if (!domain) return { pages, errors };

  let home = await fetchPage(`https://${domain}/`, Math.min(PAGE_TIMEOUT_MS, remaining()));
  if (home.error && !/timeout/.test(home.error)) {
    const alt = await fetchPage(`https://www.${domain}/`, Math.min(PAGE_TIMEOUT_MS, remaining()));
    if (!alt.error) home = alt;
    else errors.push({ url: alt.url, error: alt.error });
  }
  if (home.error) {
    errors.push({ url: home.url, error: home.error });
    return { pages, errors };
  }
  pages.push({ url: home.url, text: htmlToText(home.html), kind: 'web', meta: new Set(metaDescriptions(home.html)) });

  const links = pickThesisLinks(home.html, home.url);
  // JS-rendered navs often expose no links; probe the usual thesis paths instead.
  if (links.length < 2) {
    for (const p of ['/about', '/faq', '/approach']) {
      const u = new URL(p, home.url).href;
      if (links.length < MAX_SUBPAGES && !links.some((l) => l.replace(/\/$/, '') === u)) links.push(u);
    }
  }
  const subs = await Promise.all(links.map((u) => fetchPage(u, Math.min(PAGE_TIMEOUT_MS, remaining()))));
  const seenUrls = new Set([home.url.replace(/\/$/, '')]);
  for (const p of subs) {
    if (p.error) { errors.push({ url: p.url, error: p.error }); continue; }
    const key = p.url.replace(/\/$/, '');
    if (seenUrls.has(key) || /terms-of|legal|privacy|cookie|disclaimer|policy|login/i.test(new URL(p.url).pathname)) continue;
    seenUrls.add(key);
    const text = htmlToText(p.html);
    if (text.length < 80) continue;
    pages.push({ url: p.url, text, kind: 'web', meta: new Set(metaDescriptions(p.html)), portfolio: /portfolio|companies/i.test(new URL(p.url).pathname) });
  }
  return { pages, errors };
}

async function computeStated({ name, domain, about }) {
  const { pages, errors } = await scrape(domain);
  const sources = [...pages];
  const aboutText = typeof about === 'string' ? about.trim() : '';
  if (aboutText) sources.push({ url: 'dealroom:about', text: aboutText, kind: 'about' });

  const webChars = pages.reduce((n, p) => n + p.text.length, 0);
  if (!sources.length || (webChars < 80 && !aboutText)) {
    const r = emptyResult(pages.map((p) => p.url));
    if (errors.length) Object.defineProperty(r, 'errors', { value: errors, enumerable: false });
    return r;
  }

  const source_urls = sources.map((s) => s.url);
  const kw = extractKeyword(sources, name);
  let result = {
    source_urls,
    fetched_at: new Date().toISOString(),
    method: 'keyword',
    stages: kw.stages,
    sectors: kw.sectors,
    sector_agnostic: kw.sector_agnostic,
    geographies: kw.geographies,
    cheque: kw.cheque,
    quotes: kw.quotes,
  };

  const keys = await loadLlmKeys();
  if (Object.keys(keys).length) {
    try {
      const text = sources.map((s) => `[${s.url}]\n${s.text}`).join('\n\n').slice(0, 12000);
      const llm = normaliseLlm(await callLlm(keys, name, text));
      if (llm.stages.length || llm.sectors.length || llm.geographies.length) {
        result = { ...result, method: 'llm', ...llm, cheque: llm.cheque ?? kw.cheque, quotes: llm.quotes.length ? llm.quotes : kw.quotes };
      }
    } catch { /* fall back to keyword result */ }
  }
  if (errors.length) Object.defineProperty(result, 'errors', { value: errors, enumerable: false });
  Object.defineProperty(result, 'evidence', { value: kw.evidence, enumerable: false });
  return result;
}

/**
 * Fetch and extract an investor's stated thesis. Never throws.
 * @param {{name?: string, domain?: string, about?: string|null}} input
 */
export async function fetchStatedThesis({ name, domain, about, refresh = false } = {}) {
  const d = normaliseDomain(domain);
  const key = d || `name:${String(name || '').toLowerCase()}`;
  try {
    if (refresh) memoryCache.delete(key);
    if (memoryCache.has(key)) return await memoryCache.get(key);
    const p = (async () => {
      if (d && !refresh) {
        const disk = await readDiskCache(d);
        if (disk) return disk;
      }
      const r = await computeStated({ name, domain: d, about });
      if (d && r.method !== 'unavailable') await writeDiskCache(d, r);
      return r;
    })();
    memoryCache.set(key, p);
    const r = await p;
    if (r.method === 'unavailable') memoryCache.delete(key);
    return r;
  } catch {
    memoryCache.delete(key);
    return emptyResult();
  }
}

/* ------------------------------------------------------------------ verdict */

function canonRevealedStage(s) {
  const t = String(s || '').toLowerCase().replace(/[_\s-]+/g, ' ').trim();
  if (/^pre ?seed/.test(t)) return 'Pre-Seed';
  if (/^seed|angel/.test(t)) return 'Seed';
  if (/^series a\b/.test(t) || t === 'early vc') return 'Series A';
  if (/^series b\b/.test(t)) return 'Series B';
  if (/^series [c-z]\b|series c\+/.test(t)) return 'Series C+';
  if (/growth|late|mezzanine|pre ipo|ipo|private equity|buyout/.test(t)) return 'Growth';
  return String(s);
}

function stageMatches(statedStages, revealedStage) {
  const c = canonRevealedStage(revealedStage);
  if (statedStages.includes(c)) return true;
  if ((c === 'Series C+' || c === 'Growth') && (statedStages.includes('Series C+') || statedStages.includes('Growth'))) return true;
  return false;
}

function regionShort(regionName) {
  if (!regionName) return 'target-region';
  if (/^united kingdom$/i.test(regionName)) return 'UK';
  if (/^united states/i.test(regionName)) return 'US';
  return regionName;
}

function listText(arr, conj = 'and') {
  if (arr.length <= 1) return arr.join('');
  return `${arr.slice(0, -1).join(', ')} ${conj} ${arr[arr.length - 1]}`;
}

function geoPhrase(geos) {
  if (!geos.length) return '';
  if (geos.includes('Global')) return 'globally';
  const named = geos.map((g) => (g === 'US' ? 'the US' : g === 'UK' ? 'the UK' : g));
  return `in ${listText(named)}`;
}

/**
 * Compare stated vs revealed behaviour.
 * @param {object} stated   output of fetchStatedThesis
 * @param {{stages?: Record<string, number>, industry_deals?: number, region_deals?: number, segment_deals?: number, leads?: number, last_deal?: string|null}} revealed
 * @param {{industryName?: string, stages?: string[], regionName?: string, since?: number}} query
 */
export function compareThesis(stated, revealed, query) {
  const s = stated || {};
  const r = revealed || {};
  const q = query || {};
  const sStages = Array.isArray(s.stages) ? s.stages : [];
  const sSectors = Array.isArray(s.sectors) ? s.sectors : [];
  const sGeos = Array.isArray(s.geographies) ? s.geographies : [];
  const revStages = Object.entries(r.stages || {}).filter(([, n]) => Number(n) > 0).sort((a, b) => b[1] - a[1]);
  const region = q.regionName || '';
  const industry = q.industryName || '';

  let stage = 'unknown';
  if (sStages.length) {
    if (!revStages.length) stage = 'unknown';
    else stage = revStages.some(([k]) => stageMatches(sStages, k)) ? 'match' : 'mismatch';
  }

  let sector = 'unknown';
  if (industry && sSectors.some((x) => x.toLowerCase() === industry.toLowerCase())) sector = 'match';
  else if (industry && s.sector_agnostic) sector = 'match';
  else if (sSectors.length && industry) sector = 'mismatch';

  let geography = 'unknown';
  const usOnly = sGeos.length > 0 && sGeos.every((g) => g === 'US');
  if (sGeos.length) {
    const isUK = /^(?:united kingdom|uk|great britain|england|scotland|wales|london)$/i.test(region.trim());
    const isEurope = /europe|\beu\b/i.test(region) || isUK;
    if (sGeos.includes('Global') || (sGeos.includes('UK') && isUK) || (sGeos.includes('Europe') && isEurope)) geography = 'match';
    else if (usOnly) geography = 'mismatch';
    else if (region) geography = 'mismatch';
  }

  const nums = [r.segment_deals, r.region_deals, r.industry_deals].filter((n) => Number.isFinite(Number(n)) && n !== null).map(Number);
  const deals = r.segment_deals != null ? Number(r.segment_deals) : nums.length ? Math.min(...nums) : 0;
  const since = q.since ? ` since ${q.since}` : '';
  const stageLabel = revStages.length ? ` at ${revStages.map(([k]) => k).join('/')}` : '';
  const led = Number(r.leads) > 0 ? ` (led ${r.leads})` : '';
  const regionTxt = region || 'target-region';
  const plural = deals === 1 ? '' : 's';
  const revealedTxt = `has done ${deals} ${regionTxt} ${industry} deal${plural}${stageLabel}${since}${led}`.replace(/\s+/g, ' ');

  const statedParts = [];
  if (sStages.length) statedParts.push(listText(sStages.map((x) => x.toLowerCase())));
  const listed = sSectors.some((x) => x.toLowerCase() === industry.toLowerCase());
  if (listed) statedParts.push(industry.toLowerCase());
  else if (sSectors.length && !s.sector_agnostic) statedParts.push(listText(sSectors.slice(0, 2).map((x) => x.toLowerCase()), 'and'));
  const g = geoPhrase(sGeos);
  const anySector = s.sector_agnostic && !listed ? ' in any sector' : '';
  const statedTxt = statedParts.length || g || anySector
    ? `Says it backs ${statedParts.length ? `${statedParts.join(' ')} ` : ''}founders${anySector}${g ? ` ${g}` : ''}`
    : '';

  const contradictions = [];
  if (geography === 'mismatch' && deals > 0) {
    contradictions.push(usOnly
      ? `Website says US-focused, but has joined ${deals} ${regionTxt} ${industry} round${plural}${since}${led}, so it is open to ${regionShort(region)} founders in practice`
      : `Website names ${listText(sGeos)} but not ${regionShort(region)}, yet has joined ${deals} ${regionTxt} ${industry} round${plural}${since}${led}`);
  }
  if (sector === 'mismatch' && deals > 0) {
    contradictions.push(`${contradictions.length ? 'its' : 'Its'} website lists ${listText(sSectors.slice(0, 3))} rather than ${industry}, yet it has done ${deals} ${industry} deal${plural}`);
  }
  if (stage === 'mismatch') {
    const top = revStages[0]?.[0];
    contradictions.push(`${contradictions.length ? 'it' : 'It'} says ${listText(sStages)}, but these deals were mostly ${top}`);
  }

  let summary;
  if (contradictions.length) {
    summary = `${contradictions.join('; ')}.`;
  } else if (statedTxt) {
    const allKnown = stage !== 'unknown' && sector !== 'unknown' && geography !== 'unknown';
    const anyMatch = [stage, sector, geography].includes('match');
    const tail = allKnown ? ' Consistent.' : anyMatch ? ' Consistent where stated.' : '';
    const geoNote = geography === 'mismatch' && deals === 0 ? ` but names no ${regionShort(region)} focus` : '';
    summary = `${statedTxt}${geoNote}; ${revealedTxt}.${tail}`;
  } else {
    summary = `Website gives no clear thesis; judge it on what it does: ${revealedTxt}.`;
  }
  summary = summary.replace(/\s+/g, ' ').replace(/\s+([.;,])/g, '$1');

  return { stage, sector, geography, summary };
}
