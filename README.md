# Armanix : le site de stats du groupe

Site statique hébergé sur GitHub Pages. Le programme `scripts/update.mjs` tourne toutes les 6 heures (GitHub Actions) et met à jour les fichiers du dossier `data/`, que le site lit.

## Ce qui se met à jour tout seul
- **League of Legends** (API Riot) : rangs solo et flex, % de victoires, KDA sur les 20 dernières parties, champions favoris, forme récente, séries, activité de la semaine, fil d'activité (montées, descentes, séries).
- **Counter-Strike 2** (Leetify) : Premier, % de victoires, headshots, matchs. La réponse brute de chaque joueur est gardée dans `data/raw/` pour vérifier les champs.
- **Battlefield 6** (GameTools, API communautaire publique et gratuite) : niveau, K/D, kills par minute, % de victoires, matchs, classe favorite. Le joueur est retrouvé grâce à l'identifiant de son lien tracker.gg dans `players.json`. S'il n'est pas trouvé, ajouter son pseudo EA exact (majuscules comprises) et sa plateforme : `"bf": {"link": "…", "name": "PseudoEA", "platform": "pc"}` (plateformes : `pc`, `ea`, `psn`, `xbox`). La réponse brute est gardée dans `data/raw/bf-*.json`.
- **Fil d'activité, tous jeux** : LoL (montées, descentes, séries), CS (niveau FACEIT, paliers Premier, records, séries), Battlefield 6 (paliers de 10 niveaux), Rocket League (changement de rang saisi à la main).
- **Listes de champions par lane** (Meraki Analytics) et **noms des champions** (Data Dragon de Riot), pour les roues de la page RANDOM.

## Ce qui se remplit à la main
- **Rocket League** : `data/manual.json`, format `{"Pseudo": {"rl": ["Rang", "Victoires", "Buts par match", "Mode"]}}`. Il n'existe pas de source automatique autorisée : pas d'API officielle, tracker.gg interdit l'accès automatisé, et depuis l'arrivée d'Easy Anti-Cheat (28 avril 2026) l'envoi automatique des replays via BakkesMod ne fonctionne plus en ligne. Battlefield 6 peut encore être saisi ici en secours (`"bf": [...]`) si GameTools ne trouve pas un joueur.
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
