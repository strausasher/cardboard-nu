// Cardboard NU scheduling engine. Pure functions; works in the browser (globalThis.CNU) and in Node (require).
(function (root) {
  // A meeting is [days, startMin, endMin], days like "MWF" (R = Thursday).
  function overlaps(a, b) {
    for (const x of a) for (const y of b) {
      if (x[1] < y[2] && y[1] < x[2] && [...x[0]].some(d => y[0].includes(d))) return true;
    }
    return false;
  }

  // Build schedulable items from the picked course keys.
  // picks: array of course keys (duplicates allowed for repeatable courses)
  // links: { [ck]: { with?: ck, after?: ck } }
  // offering(ck, qKey) -> { src, secs: [{ n, i, m }] } | null
  // quarters: [{ key, order }]; pins: { itemKey: qKey }
  function buildItems(picks, links, quarters, offering, pins) {
    const picked = new Set(picks);
    const left = {};
    for (const ck of picks) left[ck] = (left[ck] || 0) + 1;
    const count = {};
    const items = [];
    for (const ck of picks) {
      if (!left[ck]) continue;
      left[ck]--;
      // merge "take in the same quarter" partners into one composite item
      const group = [ck];
      const partner = links[ck] && links[ck].with;
      if (partner && left[partner]) { left[partner]--; group.push(partner); }
      for (const other of Object.keys(left)) if (left[other] && links[other] && links[other].with === ck) { left[other]--; group.push(other); }
      count[ck] = (count[ck] || 0) + 1;
      const key = group.join('+') + '#' + count[ck];
      const pin = pins && pins[key];
      const dom = [];
      for (const q of quarters) {
        if (pin && pin !== q.key) continue;
        const offs = group.map(g => offering(g, q.key));
        if (offs.some(o => !o || !o.secs.length)) continue;
        // cartesian product of sections, dropping combos that clash with themselves
        let combos = [[]];
        for (const o of offs) {
          const next = [];
          for (const c of combos) for (let si = 0; si < o.secs.length; si++) {
            const meets = o.secs[si].m;
            if (c.some(prev => overlaps(prev.meets, meets))) continue;
            next.push([...c, { si, meets }]);
            if (next.length > 400) break;
          }
          combos = next;
        }
        for (const c of combos) dom.push({ term: q.key, secs: c.map(x => x.si), meets: c.flatMap(x => x.meets) });
      }
      const after = group.map(g => links[g] && links[g].after).find(a => a && picked.has(a));
      items.push({ key, cks: group, id: group[0], load: 1, dom, after });
    }
    return items;
  }

  // Backtracking search. Returns up to maxSols distinct quarter assignments.
  function solve(items, { quarters, maxLoad = 4, maxSols = 1, limit = 40000, mode = 'even' }) {
    const order = new Map(quarters.map((q, i) => [q.key, i]));
    for (const it of items) { it.groups = {}; for (const v of it.dom) (it.groups[v.term] = it.groups[v.term] || []).push(v); }
    const last = quarters.length ? quarters[quarters.length - 1].key : null;
    const pref = (t, load) => load[t] + (mode === 'light' && t === last ? 1.5 : 0) + (mode === 'front' ? order.get(t) * 0.6 : 0);
    const seq = [...items].sort((a, b) => Object.keys(a.groups).length - Object.keys(b.groups).length || a.dom.length - b.dom.length);
    const n = seq.length, asg = new Array(n), load = {}, byTerm = {};
    for (const q of quarters) { load[q.key] = 0; byTerm[q.key] = []; }
    const placed = {};
    const sols = []; let nodes = 0, aborted = false;
    const empty = seq.find(it => !it.dom.length);
    if (empty) return { sols, aborted, empty };
    function ok(it, v) {
      if (load[v.term] + it.load > maxLoad) return false;
      for (const o of byTerm[v.term]) { if (o.id === it.id) return false; if (overlaps(o.meets, v.meets)) return false; }
      if (it.after && placed[it.after] !== undefined && !(order.get(placed[it.after]) < order.get(v.term))) return false;
      for (const t in byTerm) for (const o of byTerm[t]) if (o.after && it.cks.includes(o.after) && !(order.get(v.term) < order.get(o.term))) return false;
      return true;
    }
    function rec(i) {
      if (++nodes > limit) { aborted = true; return false; }
      if (i === n) { sols.push(seq.map((it, k) => ({ key: it.key, cks: it.cks, term: asg[k].term, secs: asg[k].secs }))); return true; }
      const it = seq[i]; let found = false;
      const terms = Object.keys(it.groups).sort((a, b) => pref(a, load) - pref(b, load));
      for (const t of terms) {
        for (const v of it.groups[t]) {
          if (!ok(it, v)) continue;
          asg[i] = v; load[t] += it.load; byTerm[t].push({ id: it.id, cks: it.cks, meets: v.meets, after: it.after, term: t });
          const prev = it.cks.map(c => placed[c]); it.cks.forEach(c => { placed[c] = t; });
          const r = rec(i + 1);
          byTerm[t].pop(); load[t] -= it.load; it.cks.forEach((c, j) => { if (prev[j] === undefined) delete placed[c]; else placed[c] = prev[j]; });
          if (aborted) return found || r;
          if (r) { found = true; if (sols.length >= maxSols) return true; break; }
        }
      }
      return found;
    }
    rec(0);
    return { sols, aborted };
  }

  // Lower is better: even spread, nothing under 3, optional light last quarter / light later quarters.
  function score(sol, quarters, mode) {
    const L = Object.fromEntries(quarters.map(q => [q.key, 0]));
    for (const a of sol) L[a.term] += 1;
    const ids = quarters.map(q => q.key);
    const avg = ids.reduce((s, t) => s + L[t], 0) / (ids.length || 1);
    let sc = 0;
    ids.forEach((t, i) => {
      sc += (L[t] - avg) ** 2;
      if (L[t] < 3) sc += 40 * (3 - L[t]);
      if (mode === 'front') sc += i * 1.5 * L[t];
    });
    if (mode === 'light' && ids.length) sc += 6 * L[ids[ids.length - 1]];
    return sc;
  }

  const api = { overlaps, buildItems, solve, score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CNU = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
