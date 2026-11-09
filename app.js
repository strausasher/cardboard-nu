/* Cardboard NU app: loads scraped terms, keeps the plan in localStorage, renders the three steps. */
(() => {
  const { buildItems, solve, score } = window.CNU;
  const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];
  const DAYN = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun' };
  const ALIAS = { ME: 'MECH_ENG', EE: 'ELEC_ENG', CE: 'COMP_ENG', CS: 'COMP_SCI', IE: 'IEMS', MSE: 'MAT_SCI', MATSCI: 'MAT_SCI', CEE: 'CIV_ENV', BME: 'BMD_ENG', CHBE: 'CHEM_ENG', GENENG: 'GEN_ENG', ES: 'ES_APPM', COMM: 'COMM_ST', PERF: 'PERF_ST' };
  const KEY = 'cardboard-nu-v1';

  // ---------- data ----------
  const terms = {};          // name -> term json
  const catalog = new Map(); // ck -> { s, n, t, tp }
  let upcoming = [];         // [{ key, label, order, src, from }]

  const orderOf = name => { const [y, s] = name.split(' '); return +y * 4 + SEASONS.indexOf(s); };
  const nameOf = order => `${Math.floor(order / 4)} ${SEASONS[order % 4]}`;

  async function loadData() {
    const list = await fetch('data/terms.json').then(r => r.json());
    await Promise.all(list.map(async t => { terms[t.name] = await fetch(`data/${t.id}.json`).then(r => r.json()); }));
    for (const t of Object.values(terms)) for (const c of t.courses) {
      const base = `${c.s} ${c.n}`;
      if (!catalog.has(base)) catalog.set(base, { s: c.s, n: c.n, t: c.t });
      for (const sec of c.sec) if (sec.tp) { const k = `${base}|${sec.tp}`; if (!catalog.has(k)) catalog.set(k, { s: c.s, n: c.n, t: c.t, tp: sec.tp }); }
    }
    const newest = Math.max(...Object.keys(terms).map(orderOf));
    upcoming = [];
    for (let o = newest; upcoming.length < 9; o++) {
      const season = SEASONS[o % 4];
      if (season === 'Summer') continue;
      const label = nameOf(o);
      if (terms[label]) { upcoming.push({ key: label, label, order: o, src: 'official', from: label }); continue; }
      const same = Object.keys(terms).filter(n => n.endsWith(season)).sort((a, b) => orderOf(b) - orderOf(a))[0];
      if (same) upcoming.push({ key: label, label, order: o, src: 'est', from: same });
    }
    document.getElementById('data-note').textContent =
      `Course data: ${Object.keys(terms).sort((a, b) => orderOf(a) - orderOf(b)).join(', ')}. Quarters marked "est." use the same quarter last year until the real schedule is posted.`;
  }

  const courseIn = (termName, s, n) => terms[termName] && terms[termName].courses.find(c => c.s === s && c.n === n);
  const offeringCache = new Map();
  function offering(ck, qKey) {
    const ck2 = ck + '@' + qKey;
    if (offeringCache.has(ck2)) return offeringCache.get(ck2);
    const q = upcoming.find(x => x.key === qKey);
    const info = catalog.get(ck);
    let res = null;
    if (q && info) {
      const c = courseIn(q.from, info.s, info.n);
      if (c) {
        const secs = c.sec.filter(s => !info.tp || s.tp === info.tp).filter(s => s.m.length || c.sec.every(x => !x.m.length));
        if (secs.length) res = { src: q.src, secs };
      }
    }
    offeringCache.set(ck2, res);
    return res;
  }

  // ---------- state ----------
  const blank = () => ({ quarters: [], groups: [], links: {}, pins: {}, maxLoad: 4, mode: 'even', idx: 0 });
  let S = blank();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage off */ } };
  function restore() {
    try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(blank(), JSON.parse(raw)); } catch (e) { /* ignore */ }
    const m = location.hash.match(/^#p=([\w-]+)$/);
    if (m) {
      try { S = Object.assign(blank(), JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))))); toast('Loaded shared plan'); } catch (e) { toast('That share link is broken'); }
      history.replaceState(null, '', location.pathname);
    }
  }
  let nextId = () => 'g' + Math.random().toString(36).slice(2, 8);

  const quarters = () => upcoming.filter(q => S.quarters.includes(q.key));
  const picksOf = st => st.groups.flatMap(g => g.need == null ? g.options : g.picks);

  // ---------- helpers ----------
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };
  const fmtT = m => { let h = Math.floor(m / 60); const mm = m % 60, ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + (mm ? ':' + String(mm).padStart(2, '0') : '') + ap; };
  const fmtM = ms => ms.length ? ms.map(([d, s, e]) => [...d].map(x => DAYN[x]).join('/') + ' ' + fmtT(s) + '–' + fmtT(e)).join(' + ') : 'Time TBA';
  const short = ck => { const c = catalog.get(ck); if (!c) return ck; return `${c.s} ${c.n.replace(/-0$/, '')}`; };
  const title = ck => { const c = catalog.get(ck); return c ? (c.tp || c.t) : ''; };
  const offeredIn = ck => quarters().filter(q => offering(ck, q.key)).map(q => q.label.replace(/^20(\d\d) (\w\w).*/, '$2 $1'));
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2000); }

  // ---------- solving ----------
  function run(picks, { maxSols = 1, limit = 15000, pins = S.pins, maxLoad = S.maxLoad } = {}) {
    const qs = quarters();
    const items = buildItems(picks, S.links, qs, offering, pins);
    return solve(items, { quarters: qs, maxLoad, maxSols, limit, mode: S.mode });
  }
  const fits = picks => { const r = run(picks); return r.sols.length ? 'yes' : r.aborted ? 'unknown' : 'no'; };
  function whyNot(ck, trialPicks) {
    if (!quarters().some(q => offering(ck, q.key))) {
      const any = upcoming.filter(q => offering(ck, q.key)).map(q => q.label);
      return any.length ? `Not offered in the quarters you picked (runs ${[...new Set(any.map(l => l.split(' ')[1]))].join('/')}).` : 'Not on any recent schedule.';
    }
    const others = trialPicks.filter(p => p !== ck);
    for (const p of [...new Set(others)]) if (!run([ck, p], { maxLoad: 99, pins: {} }).sols.length) return `Always clashes with ${short(p)}.`;
    const fixes = [...new Set(others)].filter(p => { const i = trialPicks.indexOf(p); const t = trialPicks.slice(); t.splice(i, 1); return fits(t) === 'yes'; });
    if (fixes.length) return `Can't fit with all your picks. Fits if you drop ${fixes.slice(0, 4).map(short).join(' or ')}.`;
    return `No room in the quarters it runs at ${S.maxLoad} courses each. Try raising the limit.`;
  }

  // ---------- step 1: quarters ----------
  function renderQuarters() {
    const box = document.getElementById('quarters'); box.innerHTML = '';
    for (const q of upcoming) {
      const on = S.quarters.includes(q.key);
      box.append(el('button', {
        class: 'chip', type: 'button', 'aria-pressed': on ? 'true' : 'false',
        onclick: () => { S.quarters = on ? S.quarters.filter(k => k !== q.key) : [...S.quarters, q.key].sort((a, b) => orderOf(a) - orderOf(b)); S.pins = {}; S.idx = 0; update(); }
      }, q.label, q.src === 'est' ? el('span', { class: 'est' }, ' est.') : null));
    }
  }

  // ---------- step 2: search + groups ----------
  function search(q) {
    const raw = q.trim().toUpperCase().replace(/\s+/g, ' ');
    if (raw.length < 2) return [];
    let toks = raw.split(' ');
    if (ALIAS[toks[0]]) toks[0] = ALIAS[toks[0]];
    const out = [];
    for (const [ck, c] of catalog) {
      const hay = `${c.s} ${c.s.replace('_', '')} ${c.n} ${c.t} ${c.tp || ''}`.toUpperCase();
      if (toks.every(t => hay.includes(t))) out.push(ck);
      if (out.length > 60) break;
    }
    return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  function renderResults() {
    const input = document.getElementById('q'), box = document.getElementById('results');
    const hits = search(input.value);
    box.innerHTML = '';
    box.classList.toggle('open', hits.length > 0 || input.value.trim().length >= 2);
    if (!hits.length) { if (input.value.trim().length >= 2) box.append(el('div', { class: 'res' }, el('span', { class: 'hint' }, 'No matches.'))); return; }
    for (const ck of hits) {
      const off = offeredIn(ck);
      const sel = el('select', { 'aria-label': 'Add ' + short(ck) + ' to a group', onchange: e => { addOption(e.target.value, ck); } },
        el('option', { value: '' }, 'Add to…'),
        S.groups.map(g => el('option', { value: g.id }, g.name)),
        el('option', { value: '__new' }, '+ New group'));
      box.append(el('div', { class: 'res' },
        el('div', {}, el('span', { class: 'code' }, short(ck)), ' · ', title(ck),
          el('div', { class: 'meta' }, off.length ? 'In your quarters: ' + off.join(', ') : 'Not in your selected quarters')),
        sel));
    }
  }
  function addOption(gid, ck) {
    if (!gid) return;
    let g = S.groups.find(x => x.id === gid);
    if (gid === '__new') { g = { id: nextId(), name: 'New group', need: 1, options: [], picks: [], repeat: {} }; S.groups.push(g); }
    if (!g.options.includes(ck)) g.options.push(ck);
    toast(`Added ${short(ck)} to ${g.name}`);
    update();
  }

  function reasonBlocked(g, ck) {
    const all = picksOf(S);
    if (g.need != null && !g.picks.includes(ck) && all.includes(ck) && !g.repeat[ck]) {
      const other = S.groups.find(x => x !== g && (x.need == null ? x.options : x.picks).includes(ck));
      if (other) return `Already counted in "${other.name}".`;
    }
    return null;
  }

  function renderGroups() {
    const box = document.getElementById('groups'); box.innerHTML = '';
    if (!S.groups.length) box.append(el('p', { class: 'empty' }, 'No groups yet. Click "Add a group", or "Load an example plan" to see how it works.'));
    for (const g of S.groups) {
      const all = g.need == null;
      const picks = all ? g.options : g.picks;
      const have = picks.length, need = all ? g.options.length : g.need;
      const head = el('div', { class: 'ghead' },
        el('input', { class: 'gname', type: 'text', value: g.name, 'aria-label': 'Group name', onchange: e => { g.name = e.target.value || 'Untitled group'; update(); } }),
        el('div', { class: 'row' },
          el('label', {}, 'Take',
            el('select', { 'aria-label': 'How many to take', onchange: e => { const v = e.target.value; g.need = v === 'all' ? null : +v; g.picks = g.picks.slice(0, g.need || 0); S.idx = 0; update(); } },
              el('option', { value: 'all', selected: all }, 'all of these'),
              [1, 2, 3, 4, 5, 6].map(k => el('option', { value: k, selected: g.need === k }, `${k} of these`)))),
          el('span', { class: 'status ' + (have >= need && need > 0 ? 'ok' : 'bad') }, `${have} of ${need}`),
          el('button', { class: 'link', type: 'button', title: 'Delete group', 'aria-label': 'Delete group ' + g.name, onclick: () => { S.groups = S.groups.filter(x => x !== g); update(); } }, 'Delete')));
      const opts = el('div', { class: 'opts' });
      if (!g.options.length) opts.append(el('p', { class: 'empty' }, 'Search above and add courses to this group.'));
      for (const ck of g.options) {
        const n = picks.filter(p => p === ck).length;
        const isSel = n > 0;
        let reason = null, full = false;
        if (!all && !isSel) {
          reason = reasonBlocked(g, ck);
          if (!reason && have >= need) { reason = `${need} already picked. Unpick one to swap.`; full = true; }
          if (!reason) { const trial = [...picksOf(S), ck]; if (fits(trial) === 'no') reason = whyNot(ck, trial); }
        } else if (all) {
          if (!quarters().some(q => offering(ck, q.key))) reason = whyNot(ck, picksOf(S));
        }
        const link = S.links[ck] || {};
        const toggle = () => {
          if (all) return;
          if (isSel && !(g.repeat[ck] && have < need)) g.picks = g.picks.filter(p => p !== ck);
          else if (!reason) g.picks.push(ck);
          S.idx = 0; update();
        };
        opts.append(el('div', { class: 'opt' + (isSel ? ' sel' : '') + (reason && !isSel && !full ? ' off' : ''), role: all ? null : 'button', tabindex: all ? null : 0, 'aria-pressed': all ? null : String(isSel),
          onclick: e => { if (e.target.closest('select,input,.rm,.mini,.less')) return; toggle(); }, onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('select,input,button')) { e.preventDefault(); toggle(); } } },
          el('div', {}, el('span', { class: 'code' }, short(ck)), n > 1 ? el('span', { class: 'count' }, ` ×${n}`) : null, ' · ', title(ck)),
          el('div', { class: 'meta' }, offeredIn(ck).join(' · ') || 'not in your quarters'),
          reason ? el('div', { class: full ? 'meta' : 'reason' }, reason) : null,
          n > 1 ? el('button', { class: 'less', type: 'button', onclick: () => { g.picks.splice(g.picks.indexOf(ck), 1); S.idx = 0; update(); } }, 'Take one fewer') : null,
          el('details', { class: 'mini' }, el('summary', { class: 'meta' }, 'Rules'),
            el('label', {}, 'Same quarter as',
              el('select', { onchange: e => { S.links[ck] = { ...link, with: e.target.value || undefined }; S.idx = 0; update(); } },
                el('option', { value: '' }, '—'), allOptions().filter(o => o !== ck).map(o => el('option', { value: o, selected: link.with === o }, short(o))))),
            el('label', {}, 'Only after',
              el('select', { onchange: e => { S.links[ck] = { ...link, after: e.target.value || undefined }; S.idx = 0; update(); } },
                el('option', { value: '' }, '—'), allOptions().filter(o => o !== ck).map(o => el('option', { value: o, selected: link.after === o }, short(o))))),
            all ? null : el('label', {}, el('input', { type: 'checkbox', checked: !!g.repeat[ck], onchange: e => { g.repeat[ck] = e.target.checked; update(); } }), 'Can take more than once (different topics)')),
          el('button', { class: 'link rm', type: 'button', title: 'Remove from group', 'aria-label': 'Remove ' + short(ck), onclick: () => { g.options = g.options.filter(o => o !== ck); g.picks = g.picks.filter(o => o !== ck); update(); } }, '×')));
      }
      box.append(el('div', { class: 'group' }, head, opts));
    }
  }
  const allOptions = () => [...new Set(S.groups.flatMap(g => g.options))];

  // ---------- step 3: schedule ----------
  let lastSols = [];
  function renderSchedule() {
    const qs = quarters();
    const picks = picksOf(S);
    const ctr = document.getElementById('controls'), nb = document.getElementById('notice'), box = document.getElementById('schedule'), st = document.getElementById('status');
    ctr.innerHTML = ''; nb.innerHTML = ''; box.innerHTML = '';
    const left = S.groups.reduce((a, g) => a + (g.need == null ? 0 : Math.max(0, g.need - g.picks.length)), 0);
    if (!qs.length) { nb.append(el('div', { class: 'notice warn' }, 'Pick the quarters you want to plan in step 1.')); st.className = 'status warn'; st.textContent = 'Pick quarters'; return; }
    const r = run(picks, { maxSols: 250, limit: 150000 });
    lastSols = r.sols.map(s => ({ s, sc: score(s, qs, S.mode) })).sort((a, b) => a.sc - b.sc).map(x => x.s);
    if (S.idx >= lastSols.length) S.idx = 0;
    ctr.append(
      el('label', {}, 'Max courses per quarter', el('select', { onchange: e => { S.maxLoad = +e.target.value; S.idx = 0; update(); } }, [3, 4, 5, 6].map(v => el('option', { value: v, selected: v === S.maxLoad }, v)))),
      el('label', {}, 'Spread', el('select', { onchange: e => { S.mode = e.target.value; S.idx = 0; update(); } },
        [['even', 'Even'], ['light', 'Lightest last quarter'], ['front', 'Front-load']].map(([v, l]) => el('option', { value: v, selected: v === S.mode }, l)))),
      el('span', { class: 'row' },
        el('button', { type: 'button', disabled: lastSols.length < 2, onclick: () => { S.idx = (S.idx - 1 + lastSols.length) % lastSols.length; save(); renderSchedule(); } }, '← Previous'),
        el('span', { class: 'hint' }, lastSols.length ? `Arrangement ${S.idx + 1} of ${lastSols.length}${r.aborted || lastSols.length >= 250 ? '+' : ''}` : 'No arrangement'),
        el('button', { type: 'button', disabled: lastSols.length < 2, onclick: () => { S.idx = (S.idx + 1) % lastSols.length; save(); renderSchedule(); } }, 'Next →')),
      Object.keys(S.pins).length ? el('button', { type: 'button', onclick: () => { S.pins = {}; S.idx = 0; update(); } }, 'Unlock all') : null);

    if (!picks.length) { nb.append(el('div', { class: 'notice warn' }, 'Add groups and pick courses in step 2. Your schedule will appear here.')); st.className = 'status warn'; st.textContent = 'Nothing picked yet'; return; }
    if (!lastSols.length) {
      nb.append(el('div', { class: 'notice bad' }, r.empty ? `${short(r.empty.cks[0])} isn't offered in any quarter you picked${Object.keys(S.pins).length ? ' (or is locked to one where it isn\'t)' : ''}.` : `No conflict-free schedule fits these picks at ${S.maxLoad} per quarter. Raise the limit, unlock quarters, or swap a pick.`));
      st.className = 'status bad'; st.textContent = 'No schedule fits'; return;
    }
    const sol = lastSols[S.idx];
    const L = Object.fromEntries(qs.map(q => [q.key, sol.filter(a => a.term === q.key).length]));
    const light = qs.filter(q => L[q.key] < 3);
    nb.append(el('div', { class: 'notice ' + (left ? 'warn' : 'ok') }, left ? `${left} pick${left > 1 ? 's' : ''} left in step 2. This schedule already works with what you have.` : `Everything is picked and nothing overlaps.${light.length ? ' ' + light.map(q => q.label).join(', ') + ' has fewer than 3 courses.' : ''}`));
    st.className = 'status ' + (left ? 'warn' : 'ok'); st.textContent = (left ? `${left} left to pick` : 'All picked') + ' · no conflicts';

    for (const q of qs) {
      const here = sol.filter(a => a.term === q.key);
      const list = el('div', { class: 'items' });
      if (!here.length) list.append(el('p', { class: 'empty' }, 'Nothing here.'));
      const blocks = [];
      for (const a of here) {
        const item = el('div', { class: 'item' + (S.pins[a.key] ? ' pinned' : '') });
        a.cks.forEach((ck, j) => {
          const off = offering(ck, q.key), sec = off.secs[a.secs[j]];
          item.append(el('div', {}, el('span', { class: 'code' }, short(ck)), ' ', el('span', { class: 'badge ' + off.src }, off.src === 'official' ? 'published' : 'estimate')),
            el('div', {}, title(ck)),
            el('div', { class: 'time' }, `Sec ${sec.n}${sec.i ? ' · ' + sec.i : ''} · ${fmtM(sec.m)}`));
          sec.m.forEach(m => blocks.push({ code: short(ck), m }));
        });
        const where = qs.filter(x => a.cks.every(ck => offering(ck, x.key)));
        if (where.length > 1) item.append(el('label', {}, S.pins[a.key] ? 'Locked to' : 'Keep in',
          el('select', { onchange: e => { if (e.target.value) S.pins[a.key] = e.target.value; else delete S.pins[a.key]; S.idx = 0; update(); } },
            el('option', { value: '' }, 'any quarter'), where.map(x => el('option', { value: x.key, selected: S.pins[a.key] === x.key }, x.label)))));
        list.append(item);
      }
      box.append(el('div', { class: 'q' }, el('div', { class: 'head' }, el('h3', {}, q.label), el('span', { class: 'status ' + (L[q.key] >= 3 ? 'ok' : 'warn') }, `${L[q.key]} course${L[q.key] === 1 ? '' : 's'}`)), list, week(blocks)));
    }
  }
  function week(blocks) {
    const START = 480, END = 1260, H = 234, k = H / (END - START);
    const days = blocks.some(b => /[SU]/.test(b.m[0])) ? ['M', 'T', 'W', 'R', 'F', 'S'] : ['M', 'T', 'W', 'R', 'F'];
    const g = el('div', { class: 'week', 'aria-hidden': 'true', style: `grid-template-columns: 24px repeat(${days.length}, 1fr)` });
    g.append(el('div', {}), ...days.map(d => el('div', { class: 'dh' }, DAYN[d])));
    const hours = el('div', { class: 'hours' });
    for (let h = 9; h <= 20; h += 2) hours.append(el('span', { style: `top:${(h * 60 - START) * k}px` }, String(h % 12 || 12)));
    g.append(hours);
    for (const d of days) {
      const col = el('div', { class: 'col' });
      for (let h = 9; h <= 20; h += 2) col.append(el('div', { class: 'gl', style: `top:${(h * 60 - START) * k}px` }));
      for (const b of blocks) if (b.m[0].includes(d)) col.append(el('div', { class: 'blk', style: `top:${Math.max(0, (b.m[1] - START) * k)}px;height:${Math.max(10, (b.m[2] - b.m[1]) * k)}px`, title: b.code }, b.code));
      g.append(col);
    }
    return g;
  }

  function update() { offeringCache.clear(); save(); renderQuarters(); renderGroups(); renderSchedule(); if (document.getElementById('q').value) renderResults(); }

  // ---------- toolbar ----------
  function planText() {
    const sol = lastSols[S.idx]; if (!sol) return 'No schedule yet.';
    return quarters().map(q => q.label + (q.src === 'est' ? ' (times estimated)' : '') + '\n' + sol.filter(a => a.term === q.key).map(a => a.cks.map((ck, j) => {
      const sec = offering(ck, q.key).secs[a.secs[j]];
      return `  ${short(ck)} ${title(ck)} – sec ${sec.n} – ${fmtM(sec.m)}`;
    }).join('\n')).join('\n')).join('\n\n');
  }
  async function copy(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg); } catch (e) { toast('Copy was blocked by the browser'); } }

  function example() {
    const G = (name, need, options, picks = [], repeat = {}) => ({ id: nextId(), name, need, options, picks, repeat });
    const first4 = upcoming.slice(0, 4).map(q => q.key);
    return Object.assign(blank(), {
      quarters: first4,
      groups: [
        G('MaDE: required', null, ['DSGN 388-2', 'DSGN 388-3', 'IEMS 307-0', 'IEMS 382-0', 'MECH_ENG 340-2', 'PHYSICS 135-3', 'PHYSICS 136-3']),
        G('Replacement for capstone 388-1', 1, ['DSGN 395-0|Design Objects - Furniture Design', 'DSGN 315-0', 'DSGN 380-1', 'DSGN 382-1']),
        G('Art minor: history / theory', 1, ['ART 270-0', 'ART 272-0', 'ART 260-0']),
        G('Art minor: 300-level', 2, ['ART 390-0', 'ART 372-0', 'ART 382-0'], [], { 'ART 390-0': true, 'ART 372-0': true }),
        G('Robotics: Fundamentals', 1, ['MECH_ENG 301-0', 'MECH_ENG 314-0', 'MECH_ENG 449-0']),
        G('Robotics: AI / ML', 1, ['MECH_ENG 447-0', 'ELEC_ENG 375-0', 'ELEC_ENG 373-0'], ['MECH_ENG 447-0']),
        G('Robotics: more electives', 3, ['MECH_ENG 433-0', 'MECH_ENG 410-0', 'MECH_ENG 450-0', 'MECH_ENG 409-0', 'MECH_ENG 302-0', 'ELEC_ENG 360-0', 'ELEC_ENG 326-0', 'COMP_ENG 346-0']),
      ],
      links: { 'PHYSICS 136-3': { with: 'PHYSICS 135-3' }, 'DSGN 388-3': { after: 'DSGN 388-2' } },
    });
  }

  function wire() {
    const q = document.getElementById('q');
    q.addEventListener('input', renderResults);
    q.addEventListener('focus', renderResults);
    document.addEventListener('click', e => { if (!e.target.closest('.search')) document.getElementById('results').classList.remove('open'); });
    document.getElementById('btn-add-group').onclick = () => { S.groups.push({ id: nextId(), name: 'New group', need: 1, options: [], picks: [], repeat: {} }); update(); q.focus(); };
    document.getElementById('btn-example').onclick = () => { if (S.groups.length && !confirmReplace()) return; S = example(); update(); toast('Loaded the example plan'); };
    document.getElementById('btn-clear').onclick = () => { if (S.groups.length && !confirmReplace()) return; S = blank(); S.quarters = upcoming.slice(0, 4).map(x => x.key); update(); };
    document.getElementById('btn-copy').onclick = () => copy(planText(), 'Schedule copied');
    document.getElementById('btn-share').onclick = () => {
      const enc = btoa(unescape(encodeURIComponent(JSON.stringify({ ...S, idx: 0 })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      copy(location.origin + location.pathname + '#p=' + enc, 'Share link copied');
    };
    document.getElementById('btn-export').onclick = () => {
      const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })), download: 'cardboard-nu-plan.json' });
      document.body.append(a); a.click(); a.remove();
    };
    document.getElementById('file-import').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { S = Object.assign(blank(), JSON.parse(await f.text())); update(); toast('Plan imported'); } catch (err) { toast('That file isn\'t a Cardboard NU plan'); }
      e.target.value = '';
    };
  }
  // Inline confirm without window.confirm: a second click within 3s confirms.
  let armed = 0;
  function confirmReplace() { if (Date.now() - armed < 3000) return true; armed = Date.now(); toast('This replaces your current plan. Click again to confirm.'); return false; }

  (async () => {
    wire();
    try { await loadData(); } catch (e) { document.getElementById('notice').append(el('div', { class: 'notice bad' }, 'Course data failed to load. If you opened index.html directly from disk, serve the folder instead (see README).')); return; }
    restore();
    if (!S.quarters.length) S.quarters = upcoming.slice(0, 4).map(x => x.key);
    update();
  })();
})();
