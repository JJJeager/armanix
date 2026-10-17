# Armanix : site + stats automatiques

Le site (`index.html`) lit `data/stats.json`. Une tâche GitHub Actions lance `scripts/update.mjs` toutes les 6 heures, qui met à jour les stats LoL et CS et garde l'historique (courbes). Tout est gratuit.

## Mise en place (15 min)
1. Crée un compte sur github.com, puis un dépôt **public** nommé `armanix` et envoie-y tout le contenu de ce dossier (Add file > Upload files).
2. **Pages** : Settings > Pages > Source « Deploy from a branch », branche `main`, dossier `/ (root)`. Le site sera sur `https://TON-PSEUDO.github.io/armanix/`.
3. **Clé Riot (LoL)** : sur developer.riotgames.com, connecte-toi avec ton compte Riot et enregistre un produit pour obtenir une **Personal API key** (la clé « development » classique expire toutes les 24 h). Puis Settings > Secrets and variables > Actions > New secret, nom `RIOT_API_KEY`.
4. **Clé Leetify (CS, facultative mais conseillée)** : leetify.com/app/developer, secret `LEETIFY_API_KEY`.
5. **Riot ID** : dans `players.json`, remplace `#TAG` par le vrai tag de chaque joueur (ex. `"Allo Central#EUW"`). Tant que le tag n'est pas rempli, le joueur est ignoré. Si les comptes ne sont pas sur EUW, ajoute les variables RIOT_PLATFORM et RIOT_ROUTE dans le workflow.
6. **Steam64 manquants** : Kikittitou et Valkai ont un lien Leetify « @pseudo ». Mets leur identifiant Steam64 (17 chiffres) dans `players.json`, champ `steam64`.
7. Onglet **Actions** > « Mise à jour des stats » > Run workflow, pour tester sans attendre 6 h.

## Rocket League et Battlefield 6
tracker.gg ne propose pas d'API libre, donc ces deux jeux se saisissent à la main dans `data/manual.json`, par exemple :
`{"JJJeager": {"rl": ["Diamant 1", "340", "0.9", "3v3"], "bf": ["120", "1.4", "55", "Assaut"]}}`
(l'ordre est celui des colonnes du site).

## Clips
Ajoute-les dans `data/clips.json` : `[{"title":"Ace 1v4","player":"Frozhy","game":"cs","url":"https://..."}]`
(`game` : lol, cs, rl ou bf).
