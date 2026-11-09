// Scrapes Northwestern's public class-descriptions site into data/<termId>.json.
// Usage: node scripts/scrape.mjs            (all non-summer terms listed on the site)
//        node scripts/scrape.mjs 5050 5040  (specific term ids)
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://class-descriptions.northwestern.edu';
const SKIP_SCHOOLS = new Set(['LAW', 'TGS', 'UC']); // law, grad-program listings, professional studies
const CONCURRENCY = 6;
const DAY = { Mon: 'M', Tues: 'T', Wed: 'W', Thurs: 'R', Fri: 'F', Sat: 'S', Sun: 'U' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + path, { headers: { 'User-Agent': 'CardboardNU course planner scraper' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return '';
    } catch { /* retry */ }
    await sleep(1000 * (i + 1));
  }
  throw new Error('failed ' + path);
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const toMin = t => { const [, h, m, ap] = t.match(/(\d+):(\d+)(AM|PM)/); return (+h % 12 + (ap === 'PM' ? 12 : 0)) * 60 + +m; };

// "Mon, Tues, Wed, Fri 12:00PM - 12:50PM" -> ["MTWF", 720, 770]
function parseMeeting(s) {
  const m = s.match(/^([A-Za-z, ]+?)\s+(\d+:\d+[AP]M)\s*-\s*(\d+:\d+[AP]M)$/);
  if (!m) return null;
  const days = m[1].split(',').map(d => DAY[d.trim()]).filter(Boolean).join('');
  return days ? [days, toMin(m[2]), toMin(m[3])] : null;
}

async function pool(items, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function scrapeTerm(term, name) {
  const termHtml = await get(`/${term}`);
  const schools = [...termHtml.matchAll(new RegExp(`href="${term}/([A-Z]+)"`, 'g'))].map(m => m[1]).filter(s => !SKIP_SCHOOLS.has(s));
  const subjects = [];
  for (const sc of schools) {
    const html = await get(`/${term}/${sc}`);
    for (const m of html.matchAll(new RegExp(`href="${sc}/([A-Z_]+)"[^>]*>([^<]+)<`, 'g'))) subjects.push({ school: sc, subj: m[1], label: decode(m[2]) });
  }
  const courses = [];
  await pool(subjects, async ({ school, subj }) => {
    const html = await get(`/${term}/${school}/${subj}`);
    const groups = html.split(/<h2 aria-controls="/).slice(1);
    for (const g of groups) {
      const head = g.match(/id="toggle[^"]*">([^<]+)<\/h2>/);
      if (!head) continue;
      const [, num, title] = decode(head[1]).match(/^(\S+)\s+(.*)$/) || [];
      if (!num || parseInt(num, 10) >= 500) continue; // undergrad + 400-level only
      const secs = [];
      for (const li of g.split('<li>').slice(1)) {
        const link = li.match(/href="[A-Z_]+\/(\d+)">([\s\S]*?)<\/a>([\s\S]*?)<\/li>/);
        if (!link) continue;
        const label = decode(link[2]); // "20: Title" or "66: Topic - Title"
        const sec = (label.match(/^([^:]+):/) || [])[1] || '';
        const rest = label.replace(/^[^:]+:\s*/, '');
        const topic = rest !== title && rest.endsWith(title) ? rest.slice(0, -title.length).replace(/\s*-\s*$/, '') : '';
        const parts = decode(link[3].replace(/<[^>]+>/g, ' ')).split(/\s+-\s+(?=[A-Z])/).map(s => s.replace(/^-\s*/, '').trim()).filter(Boolean);
        const meets = [], who = [];
        for (const p of parts) { const pm = parseMeeting(p); if (pm) meets.push(pm); else if (!/^TBA$/i.test(p)) who.push(p); }
        secs.push({ id: +link[1], n: sec, ...(topic ? { tp: topic } : {}), ...(who.length ? { i: who.join(', ') } : {}), m: meets });
      }
      if (secs.length) courses.push({ s: subj, n: num, t: title, sec: secs });
    }
  });
  courses.sort((a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n, undefined, { numeric: true }));
  const subjNames = Object.fromEntries(subjects.map(s => [s.subj, s.label.replace(/^[A-Z_]+\s*-\s*/, '')]));
  return { id: +term, name, scraped: new Date().toISOString().slice(0, 10), subjects: subjNames, courses };
}

const home = await get('/');
const listed = [...home.matchAll(/href="\/(\d{4})"[^>]*>([^<]+)</g)].map(m => ({ id: m[1], name: decode(m[2]) }));
const wanted = process.argv.slice(2);
const terms = wanted.length ? listed.filter(t => wanted.includes(t.id)) : listed.filter(t => !/Summer/.test(t.name)).slice(0, 4);
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
for (const t of terms) {
  const data = await scrapeTerm(t.id, t.name);
  await writeFile(new URL(`../data/${t.id}.json`, import.meta.url), JSON.stringify(data));
  console.log(`${t.name}: ${data.courses.length} courses, ${data.courses.reduce((s, c) => s + c.sec.length, 0)} sections`);
}
const index = listed.map(t => ({ id: +t.id, name: t.name })).filter(t => terms.some(x => +x.id === t.id) || wanted.length === 0 ? terms.some(x => +x.id === t.id) : true);
await writeFile(new URL('../data/terms.json', import.meta.url), JSON.stringify(index.filter(t => terms.some(x => +x.id === t.id))));
console.log('wrote data/terms.json');
