// Armanix : met à jour data/stats.json, history.json, matches.json et events.json (Node 22+, aucune dépendance)
import { readFile, writeFile } from "node:fs/promises";
const PLATFORM = process.env.RIOT_PLATFORM || "euw1", ROUTE = process.env.RIOT_ROUTE || "europe";
const RIOT = process.env.RIOT_API_KEY, LEET = process.env.LEETIFY_API_KEY;
const NMATCH = 20; // parties récentes lues par file (solo et flex)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = (v, s = "") => (v == null || Number.isNaN(v)) ? "—" : v + s;

class HttpError extends Error { constructor(status, url) { super(`HTTP ${status} sur ${url.split("?")[0]}`); this.status = status; } }
async function getJson(url, headers = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers });
    if (r.status === 429) { await sleep((Number(r.headers.get("retry-after") || 5) + 1) * 1000); continue; }
    if (!r.ok) throw new HttpError(r.status, url);
    return r.json();
  }
  throw new Error("trop de requêtes (429)");
}
const riot = async u => { await sleep(1300); return getJson(u, { "X-Riot-Token": RIOT }); };

// ---------- rangs
const TIERS = { IRON: ["Fer", 0], BRONZE: ["Bronze", 400], SILVER: ["Argent", 800], GOLD: ["Or", 1200], PLATINUM: ["Platine", 1600], EMERALD: ["Émeraude", 2000], DIAMOND: ["Diamant", 2400], MASTER: ["Maître", 2800], GRANDMASTER: ["Grand Maître", 2800], CHALLENGER: ["Challenger", 2800] };
const TORD = Object.keys(TIERS), APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const DIV = { IV: 0, III: 100, II: 200, I: 300 };
const rankText = e => { if (!e) return "Non classé"; const [fr] = TIERS[e.tier] || [e.tier]; return `${fr}${APEX.has(e.tier) ? "" : " " + e.rank} (${e.leaguePoints} LP)`; };
const wrOf = e => e ? Math.round(100 * e.wins / (e.wins + e.losses)) : null;
const scoreOf = e => e ? (TIERS[e.tier] || [0, 0])[1] + (DIV[e.rank] || 0) + e.leaguePoints : null;

// ---------- Data Dragon (noms et images des champions) et lanes (Meraki)
const dd = { version: null, champs: {} };
async function loadDDragon() {
  try {
    const v = (await getJson("https://ddragon.leagueoflegends.com/api/versions.json"))[0];
    const c = await getJson(`https://ddragon.leagueoflegends.com/cdn/${v}/data/fr_FR/champion.json`);
    const byKey = {};
    for (const ch of Object.values(c.data)) { dd.champs[ch.id.toLowerCase()] = { id: ch.id, name: ch.name }; byKey[ch.key] = { id: ch.id, name: ch.name }; }
    dd.version = v;
    await writeFile("data/champions.json", JSON.stringify({ version: v, champs: byKey }));
  } catch (e) { console.error("Data Dragon : " + e.message); }
}
async function loadLanes() {
  try {
    let j = null;
    for (const u of ["https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json", "http://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json"]) { try { j = await getJson(u); break; } catch {} }
    if (!j || !j.data) throw new Error("source indisponible");
    const L = { TOP: [], JUNGLE: [], MIDDLE: [], BOTTOM: [], UTILITY: [] };
    for (const [k, r] of Object.entries(j.data)) for (const lane in L) if (r[lane] && r[lane].playRate > 0) L[lane].push(k);
    if (Object.values(L).some(a => a.length < 15)) throw new Error("données incomplètes");
    await writeFile("data/lanes.json", JSON.stringify({ patch: j.patch, lanes: L }));
  } catch (e) { console.error("Lanes : " + e.message); }
}

// ---------- League of Legends
// Cache des parties : [kills, morts, assists, champion, victoire 0/1, date de fin]. Les anciennes entrées (sans victoire) sont relues une fois.
const matchCache = await readJson("data/matches.json", {});
const used = new Set();
let riotState = RIOT ? "ok" : "absente", riotUpdated = 0, lolErrors = 0;

async function recent(puuid, queue, cache) {
  const ids = await riot(`https://${ROUTE}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&count=${NMATCH}`);
  const known = new Set(Object.values(cache));
  let k = 0, dth = 0, a = 0, n = 0; const champs = {}, games = [];
  for (const id of ids) {
    const key = `${id}|${puuid}`; used.add(key);
    if (!matchCache[key] || matchCache[key].length < 6) {
      const m = await riot(`https://${ROUTE}.api.riotgames.com/lol/match/v5/matches/${id}`);
      const t = m.info.gameEndTimestamp || m.info.gameCreation || 0;
      for (const x of m.info.participants) if (known.has(x.puuid)) matchCache[`${id}|${x.puuid}`] = [x.kills, x.deaths, x.assists, x.championName, x.win ? 1 : 0, t];
      if (!matchCache[key]) continue;
    }
    const [kk, d2, aa, ch, w, t] = matchCache[key];
    k += kk; dth += d2; a += aa; n++; champs[ch] = (champs[ch] || 0) + 1; games.push({ w, t });
  }
  return { kda: n ? ((k + a) / Math.max(dth, 1)).toFixed(2) : null, n, champs, games };
}
const queueInfo = (e, r) => ({ tier: e ? e.tier : null, div: e ? e.rank : null, lp: e ? e.leaguePoints : null, rank: rankText(e), wr: wrOf(e), kda: r ? r.kda : null, n: r ? r.n : 0, score: scoreOf(e) });

async function lol(p, cache) {
  const [name, tag] = p.lol.riotId.split("#");
  if (riotState !== "ok" || !tag || tag === "TAG") return null;
  let puuid = cache[p.lol.riotId];
  if (!puuid) {
    puuid = (await riot(`https://${ROUTE}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)).puuid;
    cache[p.lol.riotId] = puuid;
  }
  const summ = await riot(`https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`);
  const entries = await riot(`https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
  const solo = entries.find(e => e.queueType === "RANKED_SOLO_5x5"), flex = entries.find(e => e.queueType === "RANKED_FLEX_SR");
  const s = await recent(puuid, 420, cache), f = flex ? await recent(puuid, 440, cache) : null;
  const count = {};
  for (const c of [s.champs, f ? f.champs : {}]) for (const k in c) count[k] = (count[k] || 0) + c[k];
  const champs = Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => { const m = dd.champs[k.toLowerCase()]; return { id: m ? m.id : k, name: m ? m.name : k, n }; });
  // forme récente (solo + flex mélangées, de la plus récente à la plus ancienne)
  const all = [...s.games, ...(f ? f.games : [])].sort((x, y) => y.t - x.t);
  let streak = 0;
  for (const g of all) { if (!streak) streak = g.w ? 1 : -1; else if ((streak > 0) === !!g.w) streak += streak > 0 ? 1 : -1; else break; }
  const week = all.filter(g => g.t >= Date.now() - 7 * 864e5).length;
  return { score: scoreOf(solo), d: { icon: summ.profileIconId, solo: queueInfo(solo, s), flex: queueInfo(flex, f), champs,
    form: all.slice(0, 10).map(g => g.w ? "W" : "L").join(""), streak, week, last: all.length ? all[0].t : null } };
}

// ---------- fil d'activité : montées, descentes, séries
const divOf = x => x.div || (String(x.rank || "").match(/\b(IV|III|II|I)\b/) || [])[1];
const lvl = x => (!x || !x.tier || !TIERS[x.tier]) ? null : TORD.indexOf(x.tier) * 10 + (APEX.has(x.tier) ? 0 : ({ IV: 0, III: 1, II: 2, I: 3 }[divOf(x)] ?? 0));
const label = x => TIERS[x.tier][0] + (APEX.has(x.tier) ? "" : " " + divOf(x));
const crossed = (a, b, list) => list.filter(T => a < T && b >= T).pop();
function lolEvents(name, o, n) {
  const ev = [];
  if (!o) return ev;
  for (const q of ["solo", "flex"]) {
    const a = o[q], b = n[q], qn = q === "solo" ? "en solo/duo" : "en flex", la = lvl(a), lb = lvl(b);
    if (la != null && lb != null && la !== lb) ev.push(lb > la ? { type: "up", p: name, txt: `${name} monte ${label(b)} ${qn}`, big: a.tier !== b.tier } : { type: "down", p: name, txt: `${name} redescend ${label(b)} ${qn}`, big: a.tier !== b.tier });
    else if (a && la == null && lb != null) ev.push({ type: "up", p: name, txt: `${name} est classé ${label(b)} ${qn}` });
  }
  if (typeof o.streak === "number") {
    const w = crossed(Math.max(o.streak, 0), n.streak, [3, 5, 7, 10, 15]);
    if (w) ev.push({ type: "fire", p: name, txt: `${name} enchaîne ${w} victoires d’affilée` });
    const l = crossed(Math.max(-o.streak, 0), -n.streak, [4, 6, 8, 10]);
    if (l) ev.push({ type: "tilt", p: name, txt: `${name} est en tilt : ${l} défaites d’affilée` });
  }
  return ev;
}

// ---------- Counter-Strike (Leetify) : la réponse brute est gardée dans data/raw/ pour vérifier les champs
const pct = v => v == null ? null : (Math.abs(v) <= 1 ? v * 100 : v);
async function cs(p) {
  if (!p.cs?.steam64) return null;
  const j = await getJson(`https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${p.cs.steam64}`, LEET ? { Authorization: `Bearer ${LEET}` } : {});
  await writeFile(`data/raw/cs-${slug(p.name)}.json`, JSON.stringify(j, null, 1));
  const prem = j.ranks?.premier ?? null, wr = j.winrate != null ? Math.round(pct(j.winrate)) : null, hs = j.stats?.accuracy_head;
  return { f: [prem != null ? `Premier ${prem}` : "—", fmt(wr, " %"), fmt(hs != null ? Math.round(pct(hs) * 10) / 10 : null, " %"), fmt(j.total_matches)], score: prem };
}

// ---------- boucle principale
const prev = await readJson("data/stats.json", { players: [] });
const config = await readJson("players.json", { players: [] });
const manual = await readJson("data/manual.json", {});
const history = await readJson("data/history.json", {});
const cache = await readJson("data/cache.json", {});
const events = await readJson("data/events.json", []);
const now = new Date().toISOString(), out = [], newEvents = [];
await loadDDragon();
await loadLanes();

for (const p of config.players) {
  const old = prev.players.find(x => x.name === p.name)?.games || {};
  const games = {};
  for (const g of ["lol", "cs", "rl", "bf"]) {
    if (!p[g]) continue;
    const entry = { ...(old[g] || (g === "lol" ? {} : { f: ["—", "—", "—", "—"] })) };
    if (g === "lol") delete entry.f;
    entry.link = p[g].link || (g === "lol" && !p.lol.riotId.endsWith("#TAG") ? `https://dpm.lol/${encodeURIComponent(p.lol.riotId.split("#")[0])}-${encodeURIComponent(p.lol.riotId.split("#")[1])}` : "");
    try {
      const r = g === "lol" ? await lol(p, cache) : g === "cs" ? await cs(p) : null;
      if (r) {
        if (g === "lol") { newEvents.push(...lolEvents(p.name, old.lol?.d, r.d)); riotUpdated++; }
        if (r.f) entry.f = r.f; if (r.d) entry.d = r.d;
        entry.updated = now; delete entry.error;
        if (r.score != null) { const h = ((history[p.name] ||= {})[g] ||= []); h.push([Date.now(), r.score]); if (h.length > 1500) h.shift(); }
      } else if (manual[p.name]?.[g]) { entry.f = manual[p.name][g]; entry.manual = true; }
    } catch (e) {
      entry.error = String(e.message || e);
      if (g === "lol") { lolErrors++; if (e.status === 401 || e.status === 403) riotState = "refusee"; }
      console.error(`${p.name}/${g}: ${entry.error}`);
    }
    games[g] = entry;
  }
  out.push({ name: p.name, games });
}
const status = { riot: riotState, riotMaj: riotUpdated, at: now };
await writeFile("data/stats.json", JSON.stringify({ updatedAt: now, status, ddragon: dd.version || prev.ddragon || null, players: out }, null, 1));
await writeFile("data/history.json", JSON.stringify(history));
await writeFile("data/cache.json", JSON.stringify(cache, null, 1));
await writeFile("data/events.json", JSON.stringify([...newEvents.map(e => ({ t: now, ...e })), ...events].slice(0, 80)));
const keep = (used.size && !lolErrors) ? Object.fromEntries(Object.entries(matchCache).filter(([k]) => used.has(k))) : matchCache;
await writeFile("data/matches.json", JSON.stringify(keep));
console.log(`OK : ${out.length} joueurs, LoL mis à jour pour ${riotUpdated}, clé Riot : ${riotState}, ${newEvents.length} événement(s), ${now}`);
