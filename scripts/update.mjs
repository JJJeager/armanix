// Met à jour data/stats.json, data/history.json et data/matches.json (Node 20+, aucune dépendance)
import { readFile, writeFile } from "node:fs/promises";
const PLATFORM = process.env.RIOT_PLATFORM || "euw1", ROUTE = process.env.RIOT_ROUTE || "europe";
const RIOT = process.env.RIOT_API_KEY, LEET = process.env.LEETIFY_API_KEY;
const NMATCH = 20; // nombre de parties récentes prises en compte pour le KDA
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = (v, s = "") => (v == null || Number.isNaN(v)) ? "—" : v + s;

async function getJson(url, headers = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers });
    if (r.status === 429) { await sleep((Number(r.headers.get("retry-after") || 5) + 1) * 1000); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url.split("?")[0]}`);
    return r.json();
  }
  throw new Error("trop de requêtes (429)");
}
const riot = async u => { await sleep(1300); return getJson(u, { "X-Riot-Token": RIOT }); };

const TIERS = { IRON: ["Fer", 0], BRONZE: ["Bronze", 400], SILVER: ["Argent", 800], GOLD: ["Or", 1200], PLATINUM: ["Platine", 1600], EMERALD: ["Émeraude", 2000], DIAMOND: ["Diamant", 2400], MASTER: ["Maître", 2800], GRANDMASTER: ["Grand Maître", 2800], CHALLENGER: ["Challenger", 2800] };
const DIV = { IV: 0, III: 100, II: 200, I: 300 };
const rankText = e => { if (!e) return "Non classé"; const [fr] = TIERS[e.tier] || [e.tier]; return `${fr}${["MASTER", "GRANDMASTER", "CHALLENGER"].includes(e.tier) ? "" : " " + e.rank} (${e.leaguePoints} LP)`; };
const wrOf = e => e ? Math.round(100 * e.wins / (e.wins + e.losses)) : null;

// Noms et images des champions (Data Dragon, sans clé)
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


// Lanes de chaque champion (Meraki Analytics, taux de jeu par poste) pour la roue des champions
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

// Les parties déjà lues sont gardées en cache : seules les nouvelles sont demandées à Riot
const matchCache = await readJson("data/matches.json", {});
const used = new Set();
let lolErrors = 0;

async function recent(puuid, queue, cache) {
  const ids = await riot(`https://${ROUTE}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&count=${NMATCH}`);
  const known = new Set(Object.values(cache));
  let k = 0, dth = 0, a = 0, n = 0; const champs = {};
  for (const id of ids) {
    const key = `${id}|${puuid}`; used.add(key);
    if (!matchCache[key]) {
      const m = await riot(`https://${ROUTE}.api.riotgames.com/lol/match/v5/matches/${id}`);
      for (const x of m.info.participants) if (known.has(x.puuid)) matchCache[`${id}|${x.puuid}`] = [x.kills, x.deaths, x.assists, x.championName];
      if (!matchCache[key]) continue;
    }
    const [kk, dd2, aa, ch] = matchCache[key];
    k += kk; dth += dd2; a += aa; n++; champs[ch] = (champs[ch] || 0) + 1;
  }
  return { kda: n ? ((k + a) / Math.max(dth, 1)).toFixed(2) : null, champs };
}

async function lol(p, cache) {
  const [name, tag] = p.lol.riotId.split("#");
  if (!RIOT || !tag || tag === "TAG") return null;
  let puuid = cache[p.lol.riotId];
  if (!puuid) {
    puuid = (await riot(`https://${ROUTE}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)).puuid;
    cache[p.lol.riotId] = puuid;
  }
  const summ = await riot(`https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`);
  const entries = await riot(`https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
  const solo = entries.find(e => e.queueType === "RANKED_SOLO_5x5");
  const flex = entries.find(e => e.queueType === "RANKED_FLEX_SR");
  const s = await recent(puuid, 420, cache);
  const f = flex ? await recent(puuid, 440, cache) : null;
  const count = {};
  for (const c of [s.champs, f ? f.champs : {}]) for (const k in c) count[k] = (count[k] || 0) + c[k];
  const champs = Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => { const m = dd.champs[k.toLowerCase()]; return { id: m ? m.id : k, name: m ? m.name : k, n }; });
  let score = null;
  if (solo) score = (TIERS[solo.tier] || [0, 0])[1] + (DIV[solo.rank] || 0) + solo.leaguePoints;
  return { score, d: { icon: summ.profileIconId, solo: { tier: solo ? solo.tier : null, rank: rankText(solo), wr: wrOf(solo), kda: s.kda }, flex: { tier: flex ? flex.tier : null, rank: rankText(flex), wr: wrOf(flex), kda: f ? f.kda : null }, champs } };
}

async function cs(p) {
  if (!p.cs?.steam64) return null;
  const j = await getJson(`https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${p.cs.steam64}`, LEET ? { Authorization: `Bearer ${LEET}` } : {});
  await writeFile(`data/raw/cs-${slug(p.name)}.json`, JSON.stringify(j, null, 1));
  const prem = j.ranks?.premier, wr = j.winrate != null ? Math.round(j.winrate * 100) : null, hs = j.stats?.accuracy_head;
  return { f: [prem != null ? `Premier ${prem}` : "—", fmt(wr, " %"), fmt(hs != null ? Math.round(hs * 10) / 10 : null, " %"), fmt(j.total_matches)], score: prem ?? null };
}

const prev = await readJson("data/stats.json", { players: [] });
const config = await readJson("players.json", { players: [] });
const manual = await readJson("data/manual.json", {});
const history = await readJson("data/history.json", {});
const cache = await readJson("data/cache.json", {});
const now = new Date().toISOString();
const out = [];
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
        if (r.f) entry.f = r.f; if (r.d) entry.d = r.d;
        entry.updated = now; delete entry.error;
        if (r.score != null) { const h = ((history[p.name] ||= {})[g] ||= []); h.push([Date.now(), r.score]); if (h.length > 1500) h.shift(); }
      } else if (manual[p.name]?.[g]) { entry.f = manual[p.name][g]; entry.updated = now; entry.manual = true; }
    } catch (e) { entry.error = String(e.message || e); if (g === "lol") lolErrors++; console.error(`${p.name}/${g}: ${entry.error}`); }
    games[g] = entry;
  }
  out.push({ name: p.name, games });
}
await writeFile("data/stats.json", JSON.stringify({ updatedAt: now, ddragon: dd.version || prev.ddragon || null, players: out }, null, 1));
await writeFile("data/history.json", JSON.stringify(history));
await writeFile("data/cache.json", JSON.stringify(cache, null, 1));
const keep = (used.size && !lolErrors) ? Object.fromEntries(Object.entries(matchCache).filter(([k]) => used.has(k))) : matchCache;
await writeFile("data/matches.json", JSON.stringify(keep));
console.log(`OK : ${out.length} joueurs, ${now}`);
