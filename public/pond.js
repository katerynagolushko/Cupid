const FORCE_MOCK = new URLSearchParams(location.search).get("mock") === "1";

const MOCK = {
  options: "/mock/options.json",
  search: "/mock/search.json",
  match: "/mock/match.json",
  thesis: "/mock/thesis.json",
};

const TIMEOUT = { options: 8000, search: 6000, match: 45000, thesis: 30000 };

const SCORE_LABELS = {
  segment_deals: "Deals in your segment",
  leads: "Rounds led",
  recency: "Recency",
  stage_fit: "Stage fit",
};

const state = {
  options: null,
  stages: new Set(),
  company: null,
  match: null,
  matchMock: false,
  params: null,
  byId: new Map(),
  thesisCache: new Map(),
  matchSeq: 0,
  searchSeq: 0,
};

const $ = (sel, root = document) => root.querySelector(sel);
const el = {
  badge: $("#data-badge"),
  form: $("#controls"),
  companyInput: $("#company-input"),
  companyCombo: $("#company-combo"),
  companyList: $("#company-list"),
  companyClear: $("#company-clear"),
  industry: $("#industry"),
  stages: $("#stages"),
  region: $("#region"),
  since: $("#since"),
  go: $("#go"),
  summary: $("#summary"),
  list: $("#investor-list"),
  listCount: $("#list-count"),
  graph: $("#graph"),
  bridges: $("#bridges"),
  caveats: $("#caveats"),
  drawer: $("#drawer"),
  drawerBody: $("#drawer-body"),
  backdrop: $("#drawer-backdrop"),
  tooltip: $("#tooltip"),
};

/* ---------- helpers ---------- */

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  n = Number(n);
  const trim = (x) => x.toFixed(1).replace(/\.0$/, "");
  if (n >= 1e9) return `$${trim(n / 1e9)}B`;
  if (n >= 1e6) return `$${trim(n / 1e6)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-GB"));
const fmtPct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(s) {
  if (!s) return "—";
  const [y, m] = String(s).split("-");
  return m ? `${MONTHS[+m - 1] ?? m} ${y}` : y;
}

function fmtDateTime(iso) {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtRange(r) {
  if (!r || (r.min == null && r.max == null)) return "—";
  if (r.min != null && r.max != null) return `${fmtMoney(r.min)}–${fmtMoney(r.max)}`;
  return r.min != null ? `from ${fmtMoney(r.min)}` : `up to ${fmtMoney(r.max)}`;
}

const list = (arr) => (arr && arr.length ? arr.map(esc).join(", ") : '<span class="muted">Not stated</span>');

function extLink(url, text, cls = "") {
  if (!url) return "";
  return `<a href="${esc(url)}" target="_blank" rel="noopener" class="${cls}">${text}</a>`;
}

function stageParam(stages) {
  return [...stages].join("|");
}

/* ---------- data access with saved-data fallback ---------- */

async function fetchJSON(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

async function api(kind, url) {
  if (!FORCE_MOCK) {
    try {
      return { data: await fetchJSON(url, TIMEOUT[kind]), mock: false };
    } catch (err) {
      console.warn(`[cross-the-pond] ${url} failed (${err.message}); using saved data`);
    }
  }
  return { data: await fetchJSON(MOCK[kind], 8000), mock: true };
}

function setSaved(on) {
  el.badge.hidden = !(on || FORCE_MOCK);
}

/* ---------- controls ---------- */

async function loadOptions() {
  try {
    const { data, mock } = await api("options", "/api/options");
    if (mock) setSaved(true);
    state.options = data;
    renderControls(data);
    runMatch();
  } catch (err) {
    el.summary.innerHTML = `<div class="state state-error">Couldn't load the search options (${esc(err.message)}).<br><button class="btn-ghost" type="button" id="retry-options">Try again</button></div>`;
    $("#retry-options").addEventListener("click", loadOptions);
  }
}

function renderControls(opts) {
  const d = opts.defaults || {};
  el.industry.innerHTML = (opts.industries || []).map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join("");
  el.region.innerHTML = (opts.regions || []).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("");
  if (d.industry != null) el.industry.value = String(d.industry);
  if (d.region != null) el.region.value = String(d.region);
  if (d.since != null) el.since.value = d.since;
  state.stages = new Set(d.stages && d.stages.length ? d.stages : (opts.stages || []).slice(0, 2));
  el.stages.innerHTML = (opts.stages || [])
    .map((s) => `<button type="button" class="chip" data-stage="${esc(s)}" aria-pressed="${state.stages.has(s)}">${esc(s)}</button>`)
    .join("");
}

function syncChips() {
  el.stages.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(state.stages.has(c.dataset.stage))));
}

el.stages.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const s = chip.dataset.stage;
  if (state.stages.has(s)) {
    if (state.stages.size === 1) return;
    state.stages.delete(s);
  } else {
    state.stages.add(s);
  }
  syncChips();
});

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  closeCombo();
  runMatch();
});

/* ---------- company autocomplete ---------- */

let searchTimer = null;
let comboItems = [];
let comboIndex = -1;

function openCombo() {
  el.companyList.hidden = false;
  el.companyCombo.setAttribute("aria-expanded", "true");
}

function closeCombo() {
  el.companyList.hidden = true;
  el.companyCombo.setAttribute("aria-expanded", "false");
  comboIndex = -1;
}

function renderCombo(items, msg) {
  comboItems = items;
  comboIndex = items.length ? 0 : -1;
  if (msg) {
    el.companyList.innerHTML = `<li class="opt-empty" role="option" aria-disabled="true">${msg}</li>`;
  } else {
    el.companyList.innerHTML = items
      .map((c, i) => `<li role="option" id="opt-${i}" data-i="${i}" aria-selected="${i === comboIndex}">
          <div class="opt-name">${esc(c.name)}</div>
          <div class="opt-meta">${esc([c.industry?.name, c.last_round, c.hq_country].filter(Boolean).join(" · "))}${c.tagline ? ` — ${esc(c.tagline)}` : ""}</div>
        </li>`)
      .join("");
  }
  openCombo();
  updateComboActive();
}

function updateComboActive() {
  el.companyList.querySelectorAll("li[data-i]").forEach((li) => li.setAttribute("aria-selected", String(+li.dataset.i === comboIndex)));
  el.companyInput.setAttribute("aria-activedescendant", comboIndex >= 0 ? `opt-${comboIndex}` : "");
  const active = el.companyList.querySelector(`#opt-${comboIndex}`);
  if (active) active.scrollIntoView({ block: "nearest" });
}

async function doSearch(q) {
  const seq = ++state.searchSeq;
  renderCombo([], '<span class="spinner"></span>Searching Dealroom…');
  try {
    const { data, mock } = await api("search", `/api/search?q=${encodeURIComponent(q)}`);
    if (seq !== state.searchSeq) return;
    let results = data.results || [];
    if (mock) {
      const ql = q.toLowerCase();
      results = results.filter((r) => r.name.toLowerCase().includes(ql) || (r.tagline || "").toLowerCase().includes(ql));
    }
    if (!results.length) renderCombo([], `No companies match “${esc(q)}”. You can still search by industry and stage.`);
    else renderCombo(results.slice(0, 8));
  } catch (err) {
    if (seq !== state.searchSeq) return;
    renderCombo([], `Search unavailable (${esc(err.message)}).`);
  }
}

el.companyInput.addEventListener("input", () => {
  const q = el.companyInput.value.trim();
  el.companyClear.hidden = !el.companyInput.value;
  if (state.company && el.companyInput.value !== state.company.name) state.company = null;
  clearTimeout(searchTimer);
  if (q.length < 2) {
    state.searchSeq++;
    closeCombo();
    return;
  }
  searchTimer = setTimeout(() => doSearch(q), 250);
});

el.companyInput.addEventListener("keydown", (e) => {
  if (el.companyList.hidden) return;
  if (e.key === "ArrowDown" && comboItems.length) {
    e.preventDefault();
    comboIndex = (comboIndex + 1) % comboItems.length;
    updateComboActive();
  } else if (e.key === "ArrowUp" && comboItems.length) {
    e.preventDefault();
    comboIndex = (comboIndex - 1 + comboItems.length) % comboItems.length;
    updateComboActive();
  } else if (e.key === "Enter" && comboIndex >= 0 && comboItems[comboIndex]) {
    e.preventDefault();
    selectCompany(comboItems[comboIndex]);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeCombo();
  }
});

el.companyList.addEventListener("mousedown", (e) => {
  const li = e.target.closest("li[data-i]");
  if (!li) return;
  e.preventDefault();
  selectCompany(comboItems[+li.dataset.i]);
});

el.companyInput.addEventListener("blur", () => setTimeout(closeCombo, 120));

el.companyClear.addEventListener("click", () => {
  state.company = null;
  el.companyInput.value = "";
  el.companyClear.hidden = true;
  closeCombo();
  el.companyInput.focus();
});

function stagesForLastRound(last) {
  const all = state.options?.stages || [];
  const pick = {
    "Series A": ["Seed", "Series A"],
    "Series B": ["Series A", "Series B"],
  }[last] || ["Pre-Seed", "Seed"];
  const valid = pick.filter((s) => all.includes(s));
  return valid.length ? valid : all.slice(0, 2);
}

function selectCompany(c) {
  if (!c) return;
  state.company = c;
  el.companyInput.value = c.name;
  el.companyClear.hidden = false;
  closeCombo();
  if (c.industry?.id != null) {
    if (![...el.industry.options].some((o) => o.value === String(c.industry.id))) {
      el.industry.insertAdjacentHTML("beforeend", `<option value="${esc(c.industry.id)}">${esc(c.industry.name)}</option>`);
    }
    el.industry.value = String(c.industry.id);
  }
  if (c.region_id != null && [...el.region.options].some((o) => o.value === String(c.region_id))) {
    el.region.value = String(c.region_id);
  }
  state.stages = new Set(stagesForLastRound(c.last_round));
  syncChips();
  runMatch();
}

/* ---------- match ---------- */

function currentParams() {
  return {
    industry: el.industry.value,
    stages: stageParam(state.stages),
    region: el.region.value,
    since: el.since.value || "2024",
    company: state.company?.uuid || null,
    vcOnly: $("#vc-only").checked,
  };
}

function renderLoading() {
  el.summary.innerHTML = `<div class="skeleton sk-stats"></div>`;
  el.list.innerHTML = Array.from({ length: 5 }, () => `<li class="skeleton sk-card"></li>`).join("");
  el.listCount.textContent = "";
  el.graph.innerHTML = `<div class="state" style="border:0;height:100%;display:grid;place-items:center"><div><span class="spinner"></span>Walking rounds → investors → HQ…</div></div>`;
  el.bridges.innerHTML = `<div class="skeleton sk-card"></div>`;
}

async function runMatch() {
  if (!state.options) return;
  const params = currentParams();
  const qs = new URLSearchParams({ industry: params.industry, stages: params.stages, region: params.region, since: params.since });
  if (params.company) qs.set("company", params.company);
  if (params.vcOnly) qs.set("vc_only", "1");
  const seq = ++state.matchSeq;
  el.go.disabled = true;
  el.go.textContent = "Searching…";
  renderLoading();
  try {
    const { data, mock } = await api("match", `/api/match?${qs}`);
    if (seq !== state.matchSeq) return;
    state.match = data;
    state.matchMock = mock;
    state.params = params;
    setSaved(mock);
    renderMatch(data);
  } catch (err) {
    if (seq !== state.matchSeq) return;
    const msg = `<div class="state state-error">Couldn't load investors (${esc(err.message)}).<br><button class="btn-ghost" type="button" data-retry>Try again</button></div>`;
    el.summary.innerHTML = msg;
    el.list.innerHTML = "";
    el.graph.innerHTML = "";
    el.bridges.innerHTML = "";
    el.summary.querySelector("[data-retry]").addEventListener("click", runMatch);
  } finally {
    if (seq === state.matchSeq) {
      el.go.disabled = false;
      el.go.textContent = "Find US investors";
    }
  }
}

function renderMatch(m) {
  state.byId = new Map();
  for (const i of m.investors || []) state.byId.set(i.uuid, { kind: "us", data: i });
  for (const b of m.bridges || []) if (!state.byId.has(b.uuid)) state.byId.set(b.uuid, { kind: "bridge", data: b });
  renderSummary(m);
  renderInvestors(m.investors || []);
  renderGraph(m.graph || { nodes: [], edges: [] }, m);
  renderBridges(m.bridges || []);
  el.caveats.innerHTML = (m.caveats || []).map((c) => `<li>${esc(c)}</li>`).join("") || `<li class="muted">None reported.</li>`;
}

function renderSummary(m) {
  const q = m.query || {};
  const s = m.stats || {};
  const b = m.benchmark || {};
  const company = q.company || (state.matchMock ? state.company : null);
  const companyHtml = company
    ? `<span class="company-pill"><span class="dot dot-company"></span><strong>${esc(company.name)}</strong></span>`
    : "";
  el.summary.innerHTML = `
    <p class="query-line">${companyHtml}Companies HQ'd in <strong>${esc(q.region?.name ?? "—")}</strong> · <strong>${esc(q.industry?.name ?? "—")}</strong> · <strong>${esc((q.stages || []).join(", ") || "—")}</strong> rounds since <strong>${esc(q.since ?? "—")}</strong></p>
    <div class="stats">
      <div class="stat"><div class="stat-num">${fmtInt(s.rounds)}</div><div class="stat-label">VC rounds</div><div class="stat-sub">in this segment</div></div>
      <div class="stat"><div class="stat-num">${fmtInt(s.investors)}</div><div class="stat-label">investors</div><div class="stat-sub">joined those rounds</div></div>
      <div class="stat"><div class="stat-num us">${fmtInt(s.us_investors)}</div><div class="stat-label">US investors</div><div class="stat-sub">HQ in the United States</div></div>
      <div class="stat"><div class="stat-num us">${fmtPct(s.us_share_of_rounds)}</div><div class="stat-label">of rounds had a US investor</div><div class="stat-sub">${fmtInt(s.rounds_with_us_investor)} of ${fmtInt(s.rounds)}</div></div>
      <div class="stat"><div class="stat-num">${fmtMoney(b.median_amount)}</div><div class="stat-label">median round (n=${fmtInt(b.n_amount)})</div><div class="stat-sub">middle half ${fmtMoney(b.p25_amount)}–${fmtMoney(b.p75_amount)}${b.median_valuation != null ? ` · median valuation ${fmtMoney(b.median_valuation)} (n=${fmtInt(b.n_valuation)})` : ""}</div></div>
    </div>
    <p class="method">Method: ${esc(m.method || "not reported")} · Retrieved ${fmtDateTime(m.retrieved_at)}${m.from_cache ? " (cached)" : ""}${state.matchMock ? " · saved snapshot" : ""}</p>`;
}

/* ---------- investor list ---------- */

function scoreBar(bd) {
  const parts = Object.keys(SCORE_LABELS).filter((k) => bd && bd[k] != null);
  const aria = parts.map((k) => `${SCORE_LABELS[k]} ${bd[k]}`).join(", ");
  return `<div class="scorebar" data-breakdown='${esc(JSON.stringify(bd || {}))}' aria-label="Score breakdown: ${esc(aria)}" role="img">
    ${parts.map((k) => `<span class="sb-${k}" style="width:${Math.max(0, Math.min(100, Number(bd[k]) || 0))}%"></span>`).join("")}
  </div>`;
}

function renderInvestors(invs) {
  el.listCount.textContent = invs.length ? `${invs.length} shown` : "";
  if (!invs.length) {
    el.list.innerHTML = `<li class="state">No US investors joined rounds in this segment.<br><span class="small">Try adding a stage, an earlier “since” year, or widening the region to European Union + UK.</span></li>`;
    return;
  }
  el.list.innerHTML = invs
    .map((inv, idx) => {
      const top = (inv.bridges || [])[0];
      return `<li class="inv-card" tabindex="0" role="button" data-id="${esc(inv.uuid)}" aria-label="${esc(inv.name)}, score ${esc(inv.score)}. Open evidence">
        <div class="inv-rank">${idx + 1}</div>
        <div>
          <div class="inv-name">${esc(inv.name)}</div>
          <div class="inv-meta">${esc([(inv.types || []).join(", "), inv.hq_city].filter(Boolean).join(" · "))}</div>
        </div>
        <div class="inv-score"><div class="inv-score-num">${esc(inv.score ?? "—")}</div><div class="inv-score-label">score</div></div>
        <div class="inv-body">
          ${scoreBar(inv.score_breakdown)}
          <div class="inv-facts">
            <span><b>${fmtInt(inv.segment_deals)}</b> deals in segment</span>
            <span><b>${fmtInt(inv.leads)}</b> led</span>
            <span>last <b>${fmtMonth(inv.last_deal)}</b></span>
            <span class="inv-links">${extLink(inv.dealroom_url, "Dealroom ↗")}</span>
          </div>
          ${top ? `<div class="inv-warm">Warm path: ${esc(top.name)} co-invested ${esc(top.shared_deals)}×</div>` : ""}
        </div>
      </li>`;
    })
    .join("");
}

el.list.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const card = e.target.closest(".inv-card");
  if (card) openDrawer(card.dataset.id, card);
});
el.list.addEventListener("keydown", (e) => {
  const card = e.target.closest(".inv-card");
  if (card && (e.key === "Enter" || e.key === " ") && e.target === card) {
    e.preventDefault();
    openDrawer(card.dataset.id, card);
  }
});
el.list.addEventListener("mouseover", (e) => {
  const card = e.target.closest(".inv-card");
  if (card) highlight(card.dataset.id);
});
el.list.addEventListener("mouseleave", () => highlight(null));
el.list.addEventListener("focusin", (e) => {
  const card = e.target.closest(".inv-card");
  if (card) highlight(card.dataset.id);
});
el.list.addEventListener("focusout", () => highlight(null));

/* score tooltip */
document.addEventListener("mouseover", (e) => {
  const bar = e.target.closest?.(".scorebar");
  if (!bar) return;
  let bd = {};
  try { bd = JSON.parse(bar.dataset.breakdown); } catch {}
  const rows = Object.keys(SCORE_LABELS)
    .filter((k) => bd[k] != null)
    .map((k) => `<tr><td>${SCORE_LABELS[k]}</td><td class="num">${esc(bd[k])}</td></tr>`)
    .join("");
  showTooltip(`<table>${rows || "<tr><td>No breakdown</td></tr>"}</table>`, bar);
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest?.(".scorebar")) hideTooltip();
});

function showTooltip(html, anchor, pt) {
  el.tooltip.innerHTML = html;
  el.tooltip.hidden = false;
  const r = anchor ? anchor.getBoundingClientRect() : { left: pt.x, right: pt.x, top: pt.y, bottom: pt.y, width: 0 };
  const tw = el.tooltip.offsetWidth;
  const th = el.tooltip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.top - th - 8;
  if (y < 8) y = r.bottom + 8;
  x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
  el.tooltip.style.left = `${x}px`;
  el.tooltip.style.top = `${y}px`;
}
function hideTooltip() {
  el.tooltip.hidden = true;
}

/* ---------- relationship graph (hand-rolled force layout) ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";
let graphIndex = { adj: new Map(), nodeEls: new Map(), edgeEls: [] };

function layout(nodes, edges) {
  const anchorX = { us_investor: 290, bridge_investor: 710, company: 500 };
  const anchorK = { us_investor: 0.07, bridge_investor: 0.07, company: 0.004 };
  const byKind = { us_investor: [], bridge_investor: [], company: [] };
  nodes.forEach((n) => (byKind[n.kind] || byKind.company).push(n));
  for (const [kind, arr] of Object.entries(byKind)) {
    arr.forEach((n, i) => {
      const t = (i + 0.5) / arr.length;
      n.x = anchorX[kind] + Math.sin(i * 2.399) * (kind === "company" ? 140 : 30);
      n.y = 80 + t * 540;
      n.vx = 0;
      n.vy = 0;
    });
  }
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const links = edges.map((e) => [idx.get(e.source), idx.get(e.target)]).filter(([a, b]) => a != null && b != null);
  const N = nodes.length;
  const ITER = 320;
  for (let it = 0; it < ITER; it++) {
    const alpha = 1 - it / ITER;
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = 0.1 * (i - j); dy = 0.1; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        let f = 2200 / d2;
        const minD = a.r + b.r + 10;
        if (d < minD) f += (minD - d) * 0.5;
        const fx = (dx / d) * f;
        let fy = (dy / d) * f;
        if (a.kind === b.kind && a.kind !== "company" && Math.abs(dx) < 160 && Math.abs(dy) < 30) {
          fy += (dy >= 0 ? 1 : -1) * (30 - Math.abs(dy)) * 0.4;
        }
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    for (const [ia, ib] of links) {
      const a = nodes[ia];
      const b = nodes[ib];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 80) * 0.035;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    for (const n of nodes) {
      n.vx += ((anchorX[n.kind] ?? 500) - n.x) * (anchorK[n.kind] ?? 0.004);
      n.vy += (350 - n.y) * 0.004;
      const cap = 30 * alpha + 1;
      n.vx = Math.max(-cap, Math.min(cap, n.vx * 0.6));
      n.vy = Math.max(-cap, Math.min(cap, n.vy * 0.6));
      n.x += n.vx * alpha;
      n.y += n.vy * alpha;
    }
  }
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function renderGraph(graph, m) {
  el.graph.classList.remove("focus");
  const rawNodes = graph.nodes || [];
  if (!rawNodes.length) {
    el.graph.innerHTML = `<div class="state" style="border:0;height:100%;display:grid;place-items:center">No relationships to draw for this segment.</div>`;
    graphIndex = { adj: new Map(), nodeEls: new Map(), edgeEls: [] };
    return;
  }
  const invById = new Map((m.investors || []).map((i) => [i.uuid, i]));
  const brById = new Map((m.bridges || []).map((b) => [b.uuid, b]));
  const ids = new Set(rawNodes.map((n) => n.id));
  const edges = (graph.edges || []).filter((e) => ids.has(e.source) && ids.has(e.target));
  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const nodes = rawNodes.map((n) => {
    const deg = degree.get(n.id) || 0;
    let r = 4.5;
    if (n.kind === "us_investor") r = 7 + Math.sqrt(invById.get(n.id)?.segment_deals ?? deg) * 3;
    else if (n.kind === "bridge_investor") r = 7 + Math.sqrt(brById.get(n.id)?.shared_deals_with_us ?? deg) * 2.6;
    else r = 4 + Math.min(4, deg);
    return { ...n, r };
  });
  layout(nodes, edges);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const w = n.kind === "company" ? 0 : n.label.length * 7 + 8;
    const left = n.kind === "us_investor" ? n.x - n.r - w : n.x - n.r;
    const right = n.kind === "bridge_investor" ? n.x + n.r + w : n.x + n.r;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, n.y - n.r - 6);
    maxY = Math.max(maxY, n.y + n.r + 16);
  }
  const pad = 24;
  const root = svg("svg", {
    viewBox: `${minX - pad} ${minY - pad - 18} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2 + 18}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": `Relationship graph: ${nodes.filter((n) => n.kind === "us_investor").length} US investors, ${nodes.filter((n) => n.kind === "bridge_investor").length} UK/EU bridge investors and ${nodes.filter((n) => n.kind === "company").length} companies they backed`,
  });
  const sideY = minY - pad + 2;
  const sideUS = svg("text", { x: minX, y: sideY, "font-size": 11, "font-weight": 700, fill: "var(--us)", "letter-spacing": "0.08em" });
  sideUS.textContent = "US INVESTORS";
  const sideUK = svg("text", { x: maxX, y: sideY, "font-size": 11, "font-weight": 700, fill: "var(--bridge)", "text-anchor": "end", "letter-spacing": "0.08em" });
  sideUK.textContent = "UK/EU BRIDGES";
  const sideMid = svg("text", { x: (minX + maxX) / 2, y: sideY, "font-size": 11, "font-weight": 700, fill: "var(--company)", "text-anchor": "middle", "letter-spacing": "0.08em" });
  sideMid.textContent = "COMPANIES THEY BACKED";
  root.append(sideUS, sideMid, sideUK);

  const pos = new Map(nodes.map((n) => [n.id, n]));
  const gEdges = svg("g");
  const adj = new Map(nodes.map((n) => [n.id, new Set()]));
  const edgeEls = [];
  for (const e of edges) {
    const a = pos.get(e.source);
    const b = pos.get(e.target);
    const line = svg("line", { x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1), class: `g-edge ${e.is_lead ? "lead" : "follow"}` });
    gEdges.append(line);
    edgeEls.push({ el: line, s: e.source, t: e.target });
    adj.get(e.source).add(e.target);
    adj.get(e.target).add(e.source);
  }
  root.append(gEdges);

  const order = { company: 0, bridge_investor: 1, us_investor: 2 };
  const gNodes = svg("g");
  const nodeEls = new Map();
  for (const n of [...nodes].sort((a, b) => (order[a.kind] ?? 0) - (order[b.kind] ?? 0))) {
    const g = svg("g", { class: `g-node ${n.kind}`, transform: `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`, "data-id": n.id });
    if (n.kind !== "company") {
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `${n.label}, ${n.kind === "us_investor" ? "US investor" : "bridge investor"}, ${adj.get(n.id).size} companies`);
    }
    g.append(svg("circle", { r: n.r.toFixed(1) }));
    const label = svg("text", n.kind === "us_investor"
      ? { x: -n.r - 5, y: 4, "text-anchor": "end" }
      : n.kind === "bridge_investor"
        ? { x: n.r + 5, y: 4 }
        : { x: 0, y: n.r + 12, "text-anchor": "middle" });
    label.textContent = n.label;
    g.append(label);
    gNodes.append(g);
    nodeEls.set(n.id, g);
  }
  root.append(gNodes);
  el.graph.innerHTML = "";
  el.graph.append(root);
  graphIndex = { adj, nodeEls, edgeEls, nodes: pos };
}

function highlight(id) {
  const { adj, nodeEls, edgeEls } = graphIndex;
  if (!id || !nodeEls.has(id)) {
    el.graph.classList.remove("focus");
    nodeEls.forEach((g) => g.classList.remove("on"));
    edgeEls.forEach((e) => e.el.classList.remove("on"));
    document.querySelectorAll(".is-hot").forEach((n) => n.classList.remove("is-hot"));
    return;
  }
  const on = new Set([id, ...(adj.get(id) || [])]);
  el.graph.classList.add("focus");
  nodeEls.forEach((g, nid) => g.classList.toggle("on", on.has(nid)));
  edgeEls.forEach((e) => e.el.classList.toggle("on", e.s === id || e.t === id));
  document.querySelectorAll(".is-hot").forEach((n) => n.classList.remove("is-hot"));
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((n) => {
    if (!n.closest("svg")) n.classList.add("is-hot");
  });
}

el.graph.addEventListener("mouseover", (e) => {
  const g = e.target.closest?.(".g-node");
  if (!g) return;
  const id = g.dataset.id;
  highlight(id);
  const n = graphIndex.nodes?.get(id);
  if (!n) return;
  const neighbours = [...(graphIndex.adj.get(id) || [])].map((x) => graphIndex.nodes.get(x)?.label).filter(Boolean);
  const what = n.kind === "company" ? "Backed by" : "Backed";
  showTooltip(`<strong>${esc(n.label)}</strong><br>${what} ${neighbours.length}: ${esc(neighbours.slice(0, 6).join(", "))}${neighbours.length > 6 ? "…" : ""}`, g.querySelector("circle"));
});
el.graph.addEventListener("mouseout", (e) => {
  const g = e.target.closest?.(".g-node");
  if (g && !g.contains(e.relatedTarget)) {
    highlight(null);
    hideTooltip();
  }
});
el.graph.addEventListener("focusin", (e) => {
  const g = e.target.closest?.(".g-node");
  if (g) highlight(g.dataset.id);
});
el.graph.addEventListener("focusout", () => highlight(null));

function activateNode(g) {
  const id = g.dataset.id;
  const entry = state.byId.get(id);
  if (!entry) return;
  if (entry.kind === "us") {
    hideTooltip();
    openDrawer(id, g);
  } else {
    const row = el.bridges.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("is-hot");
      setTimeout(() => row.classList.remove("is-hot"), 1600);
    }
  }
}
el.graph.addEventListener("click", (e) => {
  const g = e.target.closest?.(".g-node");
  if (g) activateNode(g);
});
el.graph.addEventListener("keydown", (e) => {
  const g = e.target.closest?.(".g-node");
  if (g && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    activateNode(g);
  }
});

/* ---------- bridges table ---------- */

function renderBridges(bridges) {
  if (!bridges.length) {
    el.bridges.innerHTML = `<div class="state">No UK/EU investor co-invested with a US fund in this segment.</div>`;
    return;
  }
  const max = Math.max(...bridges.map((b) => b.shared_deals_with_us || 0), 1);
  el.bridges.innerHTML = `<table>
    <thead><tr><th>Investor</th><th>HQ</th><th class="num">Deals shared with US funds</th><th>US co-investors</th><th class="num">Deals led</th></tr></thead>
    <tbody>${bridges
      .map((b) => `<tr data-id="${esc(b.uuid)}">
        <td><strong>${b.dealroom_url ? extLink(b.dealroom_url, esc(b.name)) : esc(b.name)}</strong></td>
        <td>${esc(b.hq_country ?? "Unknown")}</td>
        <td class="num"><b>${fmtInt(b.shared_deals_with_us)}</b><span class="bar-inline" style="width:${Math.round(((b.shared_deals_with_us || 0) / max) * 60)}px"></span></td>
        <td>${(b.us_partners || []).map((p) => `<span class="partner">${esc(p)}</span>`).join("") || '<span class="muted">—</span>'}</td>
        <td class="num">${fmtInt(b.deals_led)}</td>
      </tr>`)
      .join("")}</tbody></table>`;
}

el.bridges.addEventListener("mouseover", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (tr) highlight(tr.dataset.id);
});
el.bridges.addEventListener("mouseleave", () => highlight(null));

/* ---------- investor drawer ---------- */

let drawerReturnFocus = null;
let drawerInvestor = null;

function openDrawer(id, returnTo) {
  const entry = state.byId.get(id);
  if (!entry || entry.kind !== "us") return;
  const inv = entry.data;
  drawerInvestor = inv.uuid;
  drawerReturnFocus = returnTo || document.activeElement;
  const usNames = new Set((state.match.investors || []).map((i) => i.name));
  const brNames = new Set((state.match.bridges || []).map((b) => b.name));
  const coInv = (names) =>
    (names || [])
      .map((n) => `<span class="${brNames.has(n) ? "is-bridge" : usNames.has(n) ? "is-us" : ""}">${esc(n)}</span>`)
      .join(", ") || '<span class="muted">Solo</span>';

  const deals = inv.deals || [];
  el.drawerBody.innerHTML = `
    <div class="drawer-head">
      <div>
        <h2 id="drawer-title">${esc(inv.name)}</h2>
        <div class="drawer-sub">${esc([(inv.types || []).join(", "), inv.hq_city ? `HQ ${inv.hq_city}` : null].filter(Boolean).join(" · "))}
          ${inv.dealroom_url ? ` · ${extLink(inv.dealroom_url, "Dealroom ↗")}` : ""}
          ${inv.domain ? ` · ${extLink(`https://${inv.domain}`, `${esc(inv.domain)} ↗`)}` : ""}</div>
      </div>
      <button type="button" class="btn-ghost close" data-close aria-label="Close">×</button>
    </div>
    <div class="kpis">
      <div class="kpi"><b>${fmtInt(inv.segment_deals)}</b><span>deals in your segment</span></div>
      <div class="kpi"><b>${fmtInt(inv.leads)}</b><span>of them led</span></div>
      <div class="kpi"><b>${fmtMonth(inv.last_deal)}</b><span>most recent deal</span></div>
      <div class="kpi"><b>${fmtRange(inv.deal_size)}</b><span>typical cheque (Dealroom)</span></div>
    </div>
    ${inv.about ? `<p class="drawer-sub" style="margin-top:12px">${esc(inv.about)}</p>` : ""}

    <section>
      <h3>Says vs Does</h3>
      <div id="thesis"></div>
    </section>

    <section>
      <h3>Warm paths in</h3>
      ${(inv.bridges || []).length
        ? `<ul class="warm-list">${inv.bridges.map((b) => `<li>Warm path: <b>${esc(b.name)}</b> co-invested ${esc(b.shared_deals)}×</li>`).join("")}</ul>`
        : `<p class="muted small">No UK/EU co-investor appears more than once alongside ${esc(inv.name)} in this segment.</p>`}
    </section>

    <section>
      <h3>The evidence: ${deals.length} deal${deals.length === 1 ? "" : "s"} in your segment</h3>
      ${deals.length
        ? `<table>
        <thead><tr><th>Company</th><th>Date</th><th>Round</th><th class="num">Amount</th><th>Role</th><th>Co-investors</th><th>Source</th></tr></thead>
        <tbody>${deals
          .map((d) => `<tr>
            <td><strong>${d.company?.dealroom_url ? extLink(d.company.dealroom_url, esc(d.company.name)) : esc(d.company?.name)}</strong></td>
            <td>${fmtMonth(d.date)}</td>
            <td>${esc(d.round ?? "—")}</td>
            <td class="num">${fmtMoney(d.amount)}</td>
            <td>${d.is_lead ? '<span class="lead-badge">LEAD</span>' : '<span class="muted small">joined</span>'}</td>
            <td class="co-inv">${coInv(d.co_investors)}</td>
            <td>${d.source_url ? extLink(d.source_url, "Source ↗") : '<span class="muted small">—</span>'}</td>
          </tr>`)
          .join("")}</tbody></table>`
        : `<div class="state">No deals listed.</div>`}
    </section>`;

  el.drawer.hidden = false;
  el.backdrop.hidden = false;
  document.body.style.overflow = "hidden";
  el.drawer.scrollTop = 0;
  el.drawerBody.querySelector("[data-close]").focus();
  loadThesis(inv);
}

function closeDrawer() {
  if (el.drawer.hidden) return;
  el.drawer.hidden = true;
  el.backdrop.hidden = true;
  document.body.style.overflow = "";
  drawerInvestor = null;
  if (drawerReturnFocus && document.contains(drawerReturnFocus)) drawerReturnFocus.focus();
}

el.drawer.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeDrawer();
  const retry = e.target.closest("[data-retry-thesis]");
  if (retry) {
    const entry = state.byId.get(retry.dataset.retryThesis);
    if (entry) {
      state.thesisCache.delete(thesisKey(entry.data));
      loadThesis(entry.data);
    }
  }
});
el.backdrop.addEventListener("click", closeDrawer);

document.addEventListener("keydown", (e) => {
  if (el.drawer.hidden) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeDrawer();
  } else if (e.key === "Tab") {
    const f = [...el.drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

/* ---------- Says vs Does ---------- */

function thesisKey(inv) {
  const p = state.params || {};
  return [inv.uuid, p.industry, p.stages, p.region].join("~");
}

function derivedThesis(inv) {
  const stages = {};
  for (const d of inv.deals || []) if (d.round) stages[d.round] = (stages[d.round] || 0) + 1;
  const q = state.match?.query || {};
  return {
    investor: { uuid: inv.uuid, name: inv.name, domain: inv.domain },
    stated: { source_urls: [], fetched_at: null, method: "unavailable", stages: [], sectors: [], geographies: [], cheque: null, quotes: [] },
    revealed: { stages, industry_deals: inv.segment_deals, region_deals: inv.segment_deals, leads: inv.leads, last_deal: inv.last_deal },
    verdict: {
      stage: "unknown", sector: "unknown", geography: "unknown",
      summary: `Website thesis isn't in the saved snapshot. What they actually do: ${inv.segment_deals} ${q.region?.name ?? ""} ${q.industry?.name ?? ""} ${(q.stages || []).join("/")} deals since ${q.since ?? ""} (led ${inv.leads}).`.replace(/\s+/g, " "),
    },
  };
}

async function loadThesis(inv) {
  const box = () => (drawerInvestor === inv.uuid ? $("#thesis", el.drawerBody) : null);
  const key = thesisKey(inv);
  const cached = state.thesisCache.get(key);
  if (cached) {
    if (box()) box().innerHTML = renderThesis(cached.data, cached.mock);
    return;
  }
  const domain = inv.domain ? esc(inv.domain) : "their website";
  if (box()) {
    box().innerHTML = `<div class="state"><span class="spinner"></span>Reading ${domain} for their stated thesis and comparing it with their deals… this can take up to 15 seconds.</div>`;
  }
  const p = state.params || currentParams();
  const qs = new URLSearchParams({ investor: inv.uuid, industry: p.industry, stages: p.stages, region: p.region, since: p.since });
  if (p.vcOnly) qs.set("vc_only", "1");
  try {
    let { data, mock } = await api("thesis", `/api/thesis?${qs}`);
    if (mock && data?.investor?.uuid !== inv.uuid) data = derivedThesis(inv);
    state.thesisCache.set(key, { data, mock });
    if (box()) box().innerHTML = renderThesis(data, mock);
  } catch (err) {
    const data = derivedThesis(inv);
    if (box()) {
      box().innerHTML = `${renderThesis(data, true)}<p class="small muted">Couldn't fetch the thesis (${esc(err.message)}). <button type="button" class="btn-ghost" data-retry-thesis="${esc(inv.uuid)}">Try again</button></p>`;
    }
  }
}

const VERDICT_ICON = { match: "✓", mismatch: "✗", unknown: "?" };

function verdictChip(label, v) {
  const val = ["match", "mismatch", "unknown"].includes(v) ? v : "unknown";
  return `<span class="verdict ${val}"><span aria-hidden="true">${VERDICT_ICON[val]}</span>${esc(label)}: ${val}</span>`;
}

function renderThesis(t, mock) {
  const s = t.stated || {};
  const r = t.revealed || {};
  const v = t.verdict || {};
  const stageEntries = Object.entries(r.stages || {}).sort((a, b) => b[1] - a[1]);
  const maxStage = Math.max(1, ...stageEntries.map(([, n]) => n));
  const stagesHtml = stageEntries.length
    ? stageEntries
        .map(([k, n]) => `<div>${esc(k)} <b>${esc(n)}</b><span class="bar-inline" style="background:var(--us);width:${Math.round((n / maxStage) * 60)}px"></span></div>`)
        .join("")
    : '<span class="muted">No deals</span>';
  const unavailable = s.method === "unavailable";
  return `
    <div class="verdicts">${verdictChip("Stage", v.stage)}${verdictChip("Sector", v.sector)}${verdictChip("Geography", v.geography)}${mock ? '<span class="badge badge-saved" style="align-self:center">Saved data</span>' : ""}</div>
    ${v.summary ? `<p class="verdict-summary">${esc(v.summary)}</p>` : ""}
    <div class="svd">
      <div class="svd-col">
        <h4>Says <span class="muted small">(their website)</span></h4>
        ${unavailable ? `<p class="small muted" style="margin:0 0 6px">Couldn't read a stated thesis from their website, so only behaviour is shown.</p>` : ""}
        <dl style="margin:0">
          <div class="svd-row"><dt>Stages</dt><dd>${list(s.stages)}</dd></div>
          <div class="svd-row"><dt>Sectors</dt><dd>${list(s.sectors)}</dd></div>
          <div class="svd-row"><dt>Geographies</dt><dd>${list(s.geographies)}</dd></div>
          <div class="svd-row"><dt>Cheque</dt><dd>${s.cheque ? fmtRange(s.cheque) : '<span class="muted">Not stated</span>'}</dd></div>
          ${(s.quotes || []).length ? `<div class="svd-row"><dt>In their words</dt><dd>${s.quotes.slice(0, 3).map((q) => `<p class="quote">“${esc(q)}”</p>`).join("")}</dd></div>` : ""}
          ${(s.source_urls || []).length ? `<div class="svd-row"><dt>Sources</dt><dd class="sources">${s.source_urls.map((u) => extLink(u, esc(u))).join("<br>")}</dd></div>` : ""}
        </dl>
        <p class="small muted" style="margin:8px 0 0">Read by ${esc(s.method || "unknown")}${s.fetched_at ? ` · ${fmtDateTime(s.fetched_at)}` : ""}</p>
      </div>
      <div class="svd-col">
        <h4>Does <span class="muted small">(Dealroom rounds in your segment)</span></h4>
        <dl style="margin:0">
          <div class="svd-row"><dt>Stages</dt><dd>${stagesHtml}</dd></div>
          <div class="svd-row"><dt>Industry deals</dt><dd><b>${fmtInt(r.industry_deals)}</b></dd></div>
          <div class="svd-row"><dt>Region deals</dt><dd><b>${fmtInt(r.region_deals)}</b></dd></div>
          <div class="svd-row"><dt>Led</dt><dd><b>${fmtInt(r.leads)}</b></dd></div>
          <div class="svd-row"><dt>Last deal</dt><dd>${fmtMonth(r.last_deal)}</dd></div>
        </dl>
      </div>
    </div>`;
}

/* ---------- boot ---------- */

setSaved(false);
loadOptions();

document.querySelector("#vc-only").addEventListener("change", () => runMatch());
