# Armanix : le site de stats du groupe

Site statique hébergé sur GitHub Pages. Le programme `scripts/update.mjs` tourne toutes les 6 heures (GitHub Actions) et met à jour les fichiers du dossier `data/`, que le site lit.

## Ce qui se met à jour tout seul
- **League of Legends** (API Riot) : rangs solo et flex, % de victoires, KDA sur les 20 dernières parties, champions favoris, forme récente, séries, activité de la semaine, fil d'activité (montées, descentes, séries).
- **Counter-Strike 2** (Leetify) : Premier, % de victoires, headshots, matchs. La réponse brute de chaque joueur est gardée dans `data/raw/` pour vérifier les champs.
- **Listes de champions par lane** (Meraki Analytics) et **noms des champions** (Data Dragon de Riot), pour les roues de la page RANDOM.

## Ce qui se remplit à la main
- **Rocket League et Battlefield 6** : `data/manual.json` (tracker.gg n'ouvre pas d'API). Format : `{"Pseudo": {"rl": ["Rang", "Victoires", "Buts par match", "Mode"], "bf": ["Niveau", "K/D", "55 %", "Classe"]}}`.
- **Rôle et description des joueurs** : `data/roster.json`, par exemple `{"JJJeager": {"role": "Le stratège", "bio": "…"}}`.
- **Joueurs suivis** : `players.json` (Riot ID complet `Nom#TAG`, identifiant Steam64 pour CS, liens de profil).

## Secrets GitHub (Settings > Secrets and variables > Actions)
- `RIOT_API_KEY` : obligatoire pour LoL. Une clé « development » expire au bout de 24 h ; pour un suivi permanent, demander une **Personal API key** sur developer.riotgames.com (« Register Product »).
- `LEETIFY_API_KEY` : facultatif.

## Quand quelque chose ne va pas
- Si la clé Riot est refusée, expirée ou absente, la mise à jour se termine **en rouge** dans l'onglet Actions (GitHub prévient en général par e-mail) et le site affiche un bandeau d'alerte. Les dernières données restent affichées.
- Si les stats LoL ont plus de 14 h, le site le signale aussi.

## Fichiers optionnels
- Logos des jeux : `lol.png`, `cs.png`, `rl.png`, `bf.png` à la racine.
- Icônes des rôles : `role-top.png`, `role-jungle.png`, `role-mid.png`, `role-adc.png`, `role-support.png` à la racine (sinon le site dessine ses propres pictogrammes).
