// Met à jour data/stats.json et data/history.json (Node 20+, aucune dépendance)
import { readFile, writeFile } from "node:fs/promises";
const PLATFORM = process.env.RIOT_PLATFORM || "euw1", ROUTE = process.env.RIOT_ROUTE || "europe";
const RIOT = process.env.RIOT_API_KEY, LEET = process.env.LEETIFY_API_KEY;
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

async function lol(p, cache) {
  const [name, tag] = p.lol.riotId.split("#");
  if (!RIOT || !tag || tag === "TAG") return null;
  let puuid = cache[p.lol.riotId];
  if (!puuid) {
    puuid = (await riot(`https://${ROUTE}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)).puuid;
    cache[p.lol.riotId] = puuid;
  }
  const entries = await riot(`https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
  const solo = entries.find(e => e.queueType === "RANKED_SOLO_5x5");
  const ids = await riot(`https://${ROUTE}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=10`);
  let k = 0, d = 0, a = 0; const champs = {};
  for (const id of ids) {
    const m = await riot(`https://${ROUTE}.api.riotgames.com/lol/match/v5/matches/${id}`);
    const me = m.info.participants.find(x => x.puuid === puuid); if (!me) continue;
    k += me.kills; d += me.deaths; a += me.assists; champs[me.championName] = (champs[me.championName] || 0) + 1;
  }
  const kda = ids.length ? ((k + a) / Math.max(d, 1)).toFixed(2) : null;
  const top = Object.entries(champs).sort((x, y) => y[1] - x[1])[0]?.[0];
  const rankText = e => { if (!e) return "Non classé"; const [fr] = TIERS[e.tier] || [e.tier]; return `${fr}${["MASTER", "GRANDMASTER", "CHALLENGER"].includes(e.tier) ? "" : " " + e.rank} (${e.leaguePoints} LP)`; };
  const flex = entries.find(e => e.queueType === "RANKED_FLEX_SR");
  const rank = rankText(solo); let wr = null, score = null;
  if (solo) {
    const base = (TIERS[solo.tier] || [0, 0])[1];
    wr = Math.round(100 * solo.wins / (solo.wins + solo.losses));
    score = base + (DIV[solo.rank] || 0) + solo.leaguePoints;
  }
  return { f: [rank, rankText(flex), fmt(wr, " %"), fmt(kda), fmt(top)], score };
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

for (const p of config.players) {
  const old = prev.players.find(x => x.name === p.name)?.games || {};
  const games = {};
  for (const g of ["lol", "cs", "rl", "bf"]) {
    if (!p[g]) continue;
    const entry = { ...(old[g] || { f: ["—", "—", "—", "—", "—"] }) };
    entry.link = p[g].link || (g === "lol" && !p.lol.riotId.endsWith("#TAG") ? `https://dpm.lol/${encodeURIComponent(p.lol.riotId.split("#")[0])}-${encodeURIComponent(p.lol.riotId.split("#")[1])}` : "");
    try {
      const r = g === "lol" ? await lol(p, cache) : g === "cs" ? await cs(p) : null;
      if (r) {
        entry.f = r.f; entry.updated = now; delete entry.error;
        if (r.score != null) { const h = ((history[p.name] ||= {})[g] ||= []); h.push([Date.now(), r.score]); if (h.length > 1500) h.shift(); }
      } else if (manual[p.name]?.[g]) { entry.f = manual[p.name][g]; entry.updated = now; entry.manual = true; }
    } catch (e) { entry.error = String(e.message || e); console.error(`${p.name}/${g}: ${entry.error}`); }
    games[g] = entry;
  }
  out.push({ name: p.name, games });
}
await writeFile("data/stats.json", JSON.stringify({ updatedAt: now, players: out }, null, 1));
await writeFile("data/history.json", JSON.stringify(history));
await writeFile("data/cache.json", JSON.stringify(cache, null, 1));
console.log(`OK : ${out.length} joueurs, ${now}`);
