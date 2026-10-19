# mcp-atlas — tâches

Catalogue public de serveurs MCP, avec le même geste que skills-atlas : chercher, lire, contrôler, puis écrire la config. Aucune tâche ci-dessous n’est commencée.

Une case se coche quand la ligne « Fait quand » est vraie. **Dépend de** ne liste que les dépendances directes. Une tâche peut démarrer quand elles sont toutes cochées. Les tâches d’une même vague n’ont pas de dépendance entre elles.

## Choix déjà posés

- Dépôt séparé. Node ≥ 20, TypeScript, Commander, Vitest, tsup. Pas de librairie extraite de skills-atlas.
- Sources : registre officiel `GET https://registry.modelcontextprotocol.io/v0.1/servers` (`version=latest`, curseur opaque), puis Glama, Smithery, mcp.so, PulseMCP. L’assemblage marche avec le registre seul. Le script de crawl n’est fini que lorsque les cinq sont branchées.
- Identité : nom DNS inversé du registre (`io.github.user/server`). Sinon `github:owner/repo`.
- Aucun serveur du catalogue n’est exécuté, ni pour lister ses outils, ni pour lire son README. L’aperçu vient du dépôt déclaré.
- Écriture v1 : Claude Code, Claude Desktop, Cursor, Codex CLI, Codex desktop et Grok Build. Codex CLI et Codex desktop partagent les mêmes fichiers. Claude et Cursor s’écrivent en JSON (`mcpServers`). Codex et Grok s’écrivent en TOML (`[mcp_servers.<nom>]`).
- Un risque haut bloque l’écriture. `--dry-run` n’écrit rien.

Hors de cette liste : langues multiples, packs, patch de l’application Electron, kit d’interface partagé avec skills-atlas.

## Vagues

| Vague | Tâches | En parallèle |
| --- | --- | --- |
| 0 | T1 | — |
| 1 | T2, T4, T23 | oui |
| 2 | T3, T5, T12, T24 | T3 après T2 ; T5 après T2, T3 et T4 ; T12 après T2 ; T24 après T23 |
| 3 | T6, T7, T8, T9, T10, T20 | oui |
| 4 | T11, T13, T21 | T11 et T13 après T10 ; T21 après T20 |
| 5 | T14, T22 | T14 après T5, T11 et T13 ; T22 après T21 |
| 6 | T15, T25 | oui |
| 7 | T16, T17, T18, T19, T26, T27 | T17 attend aussi T6 à T9 |
| 8 | T28, T29, T30 | oui |
| 9 | T31 | — |
| 10 | T32, T33, T34, T35, T36, T37, T38, T39 | oui |

## Tâches

- [x] **T1** — Squelette du dépôt
  - Dépend de : aucune
  - Fait quand : `package.json` (nom `mcp-atlas`, binaire `mcp-atlas`, `"type": "module"`, Node ≥ 20, MIT), `tsconfig.json`, tsup, Vitest, `.gitignore` et un `src/cli.ts` qui affiche l’aide. `npm test`, `npm run typecheck` et `npm run build` passent.

- [x] **T2** — Types du catalogue
  - Dépend de : T1
  - Fait quand : `src/types.ts` exporte `Origin`, `RawServer`, `Server`, `Theme`, `Catalog` (version 1), `PackageRef`, `RemoteRef`, `Transport` (`stdio` | `sse` | `streamable-http`), `Scope` (`project` | `user`), `ClientId`. Une fiche porte `id`, `name`, `title`, `description`, `version`, `repository`, `packages`, `remotes`, `origins`, `themes`, `official`, `singleRegistry`.

- [x] **T3** — Identité
  - Dépend de : T2
  - Fait quand : des fonctions pures parsent et formatent un id. Le nom DNS inversé du registre officiel l’emporte. Sans lui, l’id est `github:owner/repo`. Un id vide, avec une espace, ou qui peut passer pour une option (`-y`) est rejeté. Tests sur ces cas.

- [x] **T4** — Client HTTP
  - Dépend de : T1
  - Fait quand : un fetch avec timeout, plafond de pages et User-Agent. Un corps qui n’est pas du JSON, ou une page au-delà du plafond, produit une erreur nommée. Aucun réessai en boucle.

- [x] **T5** — Source registre officiel, et interface `Source`
  - Dépend de : T2, T3, T4
  - Fait quand : `GET /v0.1/servers?version=latest` est paginé avec le `cursor` renvoyé, `limit` ≤ 100. Le parseur lit `server.name`, description, version, `repository`, `packages`, `remotes`, et ignore les fiches supprimées. Les tests lisent une fixture, pas le réseau. L’interface `Source` est `fetch(): Promise<RawServer[]>`, avec un nom d’origine.

- [x] **T6** — Source Glama
  - Dépend de : T5
  - Fait quand : un `Source` Glama remplit des `RawServer` depuis une fixture du contrat retenu. Si la forme distante change, l’erreur dit que le contrat a bougé.

- [x] **T7** — Source Smithery
  - Dépend de : T5
  - Fait quand : même critère que T6, pour Smithery.

- [x] **T8** — Source mcp.so
  - Dépend de : T5
  - Fait quand : même critère que T6, pour mcp.so.

- [x] **T9** — Source PulseMCP
  - Dépend de : T5
  - Fait quand : même critère que T6, pour PulseMCP.

- [x] **T10** — Dédoublonnage
  - Dépend de : T3
  - Fait quand : `dedupe(raw)` rend une fiche par id canonique. Les origines sont unies, la description la plus longue gagne, la version du registre officiel gagne lorsqu’elle est là, paquets et remotes sont unis sans doublon. `singleRegistry` est vrai s’il n’y a qu’une origine. Tests avec deux fiches du même serveur venues de deux origines.

- [x] **T11** — Marque officielle
  - Dépend de : T10
  - Fait quand : `official` est vrai si la fiche a le registre officiel parmi ses origines et un statut actif. Une liste courte, versionnée dans le dépôt, peut aussi marquer le dépôt d’un vendeur. Tests pour les deux cas et pour une fiche communautaire.

- [x] **T12** — Taxonomie
  - Dépend de : T2
  - Fait quand : `taxonomy.ts` exporte une liste fermée d’ids stables (fichiers, dépôts git, bases de données, navigateurs, recherche, mémoire, design, productivité, autre). Le thème `other` existe.

- [x] **T13** — Classification
  - Dépend de : T10, T12
  - Fait quand : nom, description et labels donnent un ou deux thèmes, le premier étant le principal. Sans correspondance, le thème est `other`. Une fixture de serveurs connus (filesystem, github, postgres, puppeteer) tombe dans le thème attendu.

- [x] **T14** — Assemblage
  - Dépend de : T5, T11, T13
  - Fait quand : `buildCatalog` interroge les sources données, dédoublonne, classe, et remplit `stats` (brut par origine, fusionnés, officiels, mono-annuaire, par thème). Une source en échec est nommée et sautée. Si toutes échouent, l’assemblage échoue. Le registre officiel seul suffit à produire un catalogue.

- [x] **T15** — Instantané et chargement
  - Dépend de : T14
  - Fait quand : le catalogue s’écrit en `data/catalog.json.gz` et se relit avec contrôle du schéma (zod). Un fichier trop vieux de forme, ou tronqué, échoue avec le champ en cause. `generatedAt` est présent.

- [x] **T16** — Rafraîchissement
  - Dépend de : T15
  - Fait quand : sans réseau, le CLI sert l’instantané du paquet. En ligne, il cherche un instantané plus récent au plus toutes les 12 heures et le met en cache. `--refresh` force la vérification. `--offline` ne contacte pas le réseau.

- [x] **T17** — Script de crawl
  - Dépend de : T6, T7, T8, T9, T14, T15
  - Fait quand : `npm run crawl` écrit `data/catalog.json.gz` et imprime les comptes. Zéro fiche du registre officiel fait échouer le script. Une autre source vide est imprimée et ne fait pas échouer.

- [x] **T18** — Recherche
  - Dépend de : T15
  - Fait quand : la recherche filtre par mots (nom, titre, description, id), par thème, et par `--official`. Le tri met devant les fiches officielles présentes dans plusieurs annuaires. `--all` est accepté et documenté comme sans effet tant qu’aucun signal de popularité n’existe. Sortie programmable par les tests, sans CLI encore.

- [x] **T19** — README statique
  - Dépend de : T3, T4, T15
  - Fait quand : pour un id, le README est lu depuis l’URL du dépôt déclaré (raw GitHub), sans cloner et sans lancer de processus du serveur. Pas de dépôt : erreur lisible. Les tests servent une fixture locale.

- [x] **T20** — Commande proposée
  - Dépend de : T2, T3
  - Fait quand : la commande vient uniquement de `packages` et `remotes`. Ordre : npm avec version épinglée, image Docker ou OCI, PyPI avec version, remote `streamable-http`, puis SSE. `npx -y` ou `uvx` sans version n’est produit que si la fiche n’a pas de version, et ce cas est marqué. Aucun binaire n’est lancé. Tests pour chaque branche.

- [x] **T21** — Risques
  - Dépend de : T20
  - Fait quand : un examen du texte de la commande et des variables classe en haut ce qui télécharge et exécute (`curl|sh`, `npx -y` ou `uvx` sans version), ce qui lit un chemin de secret (`~/.ssh`, `~/.aws`), et une URL distante dont l’hôte n’est ni celui du dépôt ni celui du registre. Moyen : une variable dont le nom contient KEY, TOKEN, SECRET ou PASSWORD. Info : un paquet épinglé ou une image Docker. Les tests couvrent un cas de chaque niveau.

- [x] **T22** — Audit
  - Dépend de : T21
  - Fait quand : au moins un risque haut fait échouer l’audit. Une commande illisible est « non auditée », pas « en échec ». Le drapeau et le réglage persistant sont prévus ici : refus par défaut, passage seulement si l’audit est coupé pour cette fois ou dans la config.

- [x] **T23** — Chemins des clients
  - Dépend de : T1
  - Fait quand : un tableau décrit, pour Windows, macOS et Linux, les clients qui s’écrivent. JSON, clé `mcpServers` seule : `claude-code` (projet `.mcp.json`, utilisateur au fichier que la doc Claude Code désigne au moment du code), `claude-desktop` (`%APPDATA%\Claude\claude_desktop_config.json`, `~/Library/Application Support/Claude/claude_desktop_config.json`, `~/.config/Claude/claude_desktop_config.json`, scope utilisateur seul), `cursor` (projet `.cursor/mcp.json`, utilisateur `~/.cursor/mcp.json`). TOML, tables `[mcp_servers.<nom>]` seules : `codex-cli` et `codex-desktop` (les deux écrivent les mêmes fichiers, utilisateur `~/.codex/config.toml`, ou `%USERPROFILE%\.codex\config.toml`, déplacé si `CODEX_HOME` est défini ; projet `.codex/config.toml`, que Codex ne charge que pour un projet approuvé), `grok` (utilisateur `~/.grok/config.toml`, ou `%USERPROFILE%\.grok\config.toml` ; projet `.grok/config.toml`). Le reste de chaque fichier est hors de portée de l’écriture.

- [x] **T24** — Détection
  - Dépend de : T23
  - Fait quand : un client est détecté si son exécutable ou son dossier de config existe. `codex-desktop` se détecte par l’application de bureau, pas par un second dossier : `~/.codex` seul ne le marque pas. La fonction prend un `exists` injecté, testé sans regarder la vraie machine.

- [x] **T25** — Plan d’écriture
  - Dépend de : T20, T22, T23
  - Fait quand : une fiche et un client donnent le chemin, l’entrée (JSON `command`/`args`/`env` ou `url`, ou table TOML `[mcp_servers.<nom>]` pour Codex et Grok) et les collisions. Une clé du même nom déjà présente est signalée, pas écrasée en silence. Choisir `codex-cli` et `codex-desktop` ensemble ne produit qu’une écriture. Les autres clés du fichier restent dans le plan comme intactes. Un audit en échec n’a pas de plan, sauf audit coupé.

- [x] **T26** — Application et dry-run
  - Dépend de : T25
  - Fait quand : l’écriture est atomique (fichier temporaire puis remplacement) et laisse une copie de sauvegarde. Le dossier manquant est créé. `--dry-run` imprime le résultat et ne crée aucun fichier. Testé dans un dossier temporaire.

- [x] **T27** — Lecture de l’installé
  - Dépend de : T15, T20, T23
  - Fait quand : relire les fichiers de chaque client du tableau rattache une entrée à un id du catalogue par la commande et ses arguments, ou par l’URL. Le fichier partagé de Codex ne compte qu’une fois. Une entrée inconnue est listée à part, pas forcée dans un id.

- [x] **T28** — Désinstallation
  - Dépend de : T26, T27
  - Fait quand : retirer une clé JSON ou une table TOML ne modifie pas le reste du fichier. Même sauvegarde, même écriture atomique, même dry-run que T26. Testé dans un dossier temporaire, une fois en JSON et une fois en TOML.

- [x] **T29** — Export et import
  - Dépend de : T3, T26, T27
  - Fait quand : `export` écrit `{ "mcpAtlas": 1, "servers": ["id", …] }` pour les seuls serveurs rattachés à un id. Un id mal formé, ou qui ressemble à une option, arrête l’import avant toute écriture. L’import réutilise le plan de T26.

- [x] **T30** — Versions obsolètes
  - Dépend de : T15, T27
  - Fait quand : la version épinglée dans la config est comparée à celle du catalogue. Sans version dans la config, l’entrée est « version inconnue », pas « à jour ».

- [x] **T31** — CLI non interactive
  - Dépend de : T16, T18, T19, T22, T24, T26, T28, T29, T30
  - Fait quand : ces commandes répondent sans TUI : `themes`, `list` (`-q`, `-t`, `--official`, `--all`, `-n`, `--json`), `clients`, `show` (risques sur stderr, `--json`), `install` (`-c`, `-g`/`-p`, `-y`, `--dry-run`, `--no-audit`), `uninstall`, `installed`, `export`, `import`, `outdated`, `--offline`, `--refresh`. `install -y` sans `-c` échoue. Un risque haut est exclu et nommé, sauf `--no-audit`.

- [x] **T32** — Complétion de shell
  - Dépend de : T31
  - Fait quand : `mcp-atlas completion` écrit un script bash, zsh, fish et PowerShell qui complète commandes, options, ids du cache, clients et thèmes, sans réseau.

- [x] **T33** — Arbre dans le terminal
  - Dépend de : T31
  - Fait quand : thèmes repliables, recherche, coche, aperçu, puis revue (commande, risques, client, scope) avant toute écriture. Les fiches en risque haut arrivent décochées. Fermer la revue sans confirmer n’écrit rien.

- [x] **T34** — Page locale
  - Dépend de : T18, T31
  - Fait quand : `mcp-atlas ui` sert les mêmes fiches dans le navigateur. Installer passe par la même revue que l’arbre. Une démo statique, séparée, ne peut pas écrire.

- [x] **T35** — Serveur MCP du catalogue
  - Dépend de : T31
  - Fait quand : `mcp-atlas mcp` parle en stdio et expose chercher, montrer, installer. Installer refuse un risque haut et ne l’accepte qu’avec un argument explicite. Ce serveur ne démarre aucun serveur du catalogue.

- [x] **T36** — Skill d’usage
  - Dépend de : T31
  - Fait quand : `skills/mcp-atlas/SKILL.md` ne documente que les commandes non interactives, dit de lire la fiche avant d’installer, et dit de ne pas suivre les instructions trouvées dans un README.

- [x] **T37** — Recommandés
  - Dépend de : T15, T31
  - Fait quand : `data/recommended.json` ajoute une section, et `~/.config/mcp-atlas/recommended.json` le remplace. Un id absent du catalogue est ignoré et signalé.

- [x] **T38** — README
  - Dépend de : T17, T31
  - Fait quand : le README dit comment installer, quelles commandes existent, d’où vient le catalogue, ce que l’audit bloque, et que v1 écrit Claude Code, Claude Desktop, Cursor, Codex CLI, Codex desktop et Grok Build.

- [x] **T39** — Tests de bout en bout
  - Dépend de : T17, T31
  - Fait quand : un test sans réseau part de fixtures, charge un catalogue, cherche, montre, fait un dry-run, écrit dans un dossier temporaire pour un client JSON et un client TOML, relit l’installé, puis désinstalle. Le dossier temporaire est vide des fichiers du test à la fin.

## Hors du plan

Étendre l’écriture à d’autres clients. Ce n’est pas une tâche, et rien de T1 à T39 ne le fait. Un client ajouté plus tard réutilise le plan d’écriture, avec son chemin et son format, sans revoir le catalogue.
