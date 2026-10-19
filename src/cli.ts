import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';
import { Command, Option } from 'commander';
import { auditEnabled, auditServer, failsAudit } from './audit.js';
import { browseLoop } from './browse.js';
import { openBrowser } from './browser.js';
import { exportBundle, parseBundle, BundleError } from './bundle.js';
import { decodeCatalog, loadCatalog as loadCatalogFile } from './catalog.js';
import { ClientPathError } from './clients.js';
import { CommandError } from './command.js';
import { complete, completionScript } from './completion.js';
import { configPath, readConfig, writeConfig, type UserConfig } from './config.js';
import { detectClients } from './detect.js';
import { diagnose, type DoctorDeps } from './doctor.js';
import { formatNumber, getLang, langFlag, LANGUAGES, normalizeLang, setLang, systemLang, t, themeLabel, type Lang } from './i18n/index.js';
import { IdError, parseId } from './id.js';
import { clientsIn, installedEntries, installedMap, LOCAL_PREFIX, outdatedAll, uninstallEverywhere, updateRows, type ScopedRow } from './manage.js';
import { serveMcp, type McpOptions } from './mcp.js';
import { clientsForScope, installServers, operateContext, type OperateContext } from './operate.js';
import { applyPacks, packStatus, readPacks, type Pack } from './packs.js';
import { PlanError } from './plan.js';
import { lockProject, PROJECT_FILE, readProjectFile, withPins } from './project.js';
import { readReadme, ReadmeError } from './readme.js';
import { recommend } from './recommended.js';
import { loadLatestCatalog, type LatestOptions } from './refresh.js';
import { commandText } from './review.js';
import { searchServers, SORT_ORDERS, type SortOrder } from './search.js';
import { CLIENT_IDS, SCOPES, type Catalog, type ClientId, type Scope } from './types.js';
import type { WizardResult } from './ui/App.js';
import { logo } from './ui/logo.js';
import type { WizardProps } from './ui/run.js';
import { newerVersion } from './version.js';
import { startUi, type UiOptions } from './web/server.js';

export interface CatalogFlags {
  offline?: boolean;
  refresh?: boolean;
  /** A snapshot path or URL that replaces the latest one. */
  catalog?: string;
}

export interface CliDeps {
  loadCatalog?: (flags: CatalogFlags) => Promise<Catalog>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  home?: string;
  cwd?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  readConfig?: () => UserConfig;
  writeConfig?: (config: UserConfig) => void;
  fetch?: typeof fetch;
  recommendedUser?: string;
  recommendedBundled?: string;
  packs?: () => Pack[];
  startUi?: (opts: UiOptions) => Promise<{ url: string; close: () => Promise<void> }>;
  serveMcp?: (opts: McpOptions) => Promise<void>;
  /** The full-screen wizard; replaced in tests. */
  runWizard?: (props: WizardProps, mouse: boolean) => Promise<WizardResult | null>;
  /** Whether a person can answer the wizard. */
  interactive?: boolean;
  openBrowser?: (url: string) => void;
  /** Resolves when the web page should stop (Ctrl+C). */
  untilInterrupted?: () => Promise<void>;
  newerVersion?: () => string | undefined;
  doctor?: DoctorDeps;
}

interface FilterOpts {
  theme?: string[];
  search?: string;
  official?: boolean;
  installable?: boolean;
  all?: boolean;
  sort?: SortOrder;
}

interface InstallOpts {
  agent?: string[];
  global?: boolean;
  project?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  /** Commander stores `--no-audit` as `audit: false`. */
  audit?: boolean;
  /** `--no-mouse` stores false. */
  mouse?: boolean;
}

interface Preset {
  /** Requested clients; `*` stays until the scope is known. */
  agents?: string[];
  scope?: Scope;
}

/** Flags win over `opts`. `--offline` still suppresses a refresh inside the loader. */
export async function openCatalog(flags: CatalogFlags, opts: LatestOptions = {}): Promise<Catalog> {
  if (flags.catalog) {
    if (!/^https?:\/\//.test(flags.catalog)) return loadCatalogFile(flags.catalog);
    const res = await (opts.fetch ?? fetch)(flags.catalog);
    if (!res.ok) throw new Error(`${flags.catalog}: HTTP ${res.status}`);
    return decodeCatalog(Buffer.from(await res.arrayBuffer()));
  }
  return loadLatestCatalog({ ...opts, offline: flags.offline ?? opts.offline, refresh: flags.refresh ?? opts.refresh });
}

export function createProgram(deps: CliDeps = {}): Command {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string };
  const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
  const out = (line = '') => stdout(`${line}\n`);
  const err = (line: string) => stderr(`${line}\n`);
  const load = deps.loadCatalog ?? ((flags: CatalogFlags) => openCatalog(flags, { fetch: deps.fetch }));
  const interactive = () => deps.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);
  const m = t();
  const c = m.cli;
  /** Colors only on a real terminal, so that piped output stays plain. */
  const colored = !deps.stdout && process.stdout.isTTY === true && !('NO_COLOR' in process.env);
  const paint = (style: Parameters<typeof styleText>[0], text: string) => (colored ? styleText(style, text) : text);

  function machine(): OperateContext {
    const home = deps.home ?? homedir();
    const env = deps.env ?? process.env;
    return {
      home,
      cwd: deps.cwd ?? process.cwd(),
      platform: deps.platform ?? process.platform,
      env,
      config: (deps.readConfig ?? (() => readConfig(configPath(env, home))))(),
    };
  }

  function saveConfig(ctx: OperateContext, config: UserConfig): void {
    (deps.writeConfig ?? ((next: UserConfig) => writeConfig(next, configPath(ctx.env, ctx.home))))(config);
  }

  function flagsFrom(command: Command): CatalogFlags {
    const opts = command.optsWithGlobals() as CatalogFlags;
    return { offline: opts.offline === true, refresh: opts.refresh === true, catalog: opts.catalog };
  }

  async function openRecommended(flags: CatalogFlags): Promise<{ catalog: Catalog; missing: string[] }> {
    const loaded = await load(flags);
    const { catalog, missing } = recommend(loaded, {
      userPath: deps.recommendedUser,
      bundledPath: deps.recommendedBundled,
      env: deps.env,
      home: deps.home ?? homedir(),
    });
    return { catalog: applyPacks(catalog, packs()), missing };
  }

  function packs(): Pack[] {
    return (deps.packs ?? (() => readPacks()))();
  }

  async function catalogFor(command: Command): Promise<Catalog> {
    try {
      const { catalog, missing } = await openRecommended(flagsFrom(command));
      if (missing.length > 0) err(c.ignored(missing.join(', ')));
      return catalog;
    } catch (error) {
      command.error(error instanceof Error ? error.message : String(error));
    }
  }

  /** `-g` and `-p` together are an error; neither means both scopes. */
  function scopesOf(command: Command, opts: { global?: boolean; project?: boolean }): Scope[] {
    if (opts.global && opts.project) command.error(m.errors.exclusive('--global', '--project'));
    return opts.global ? ['user'] : opts.project ? ['project'] : [...SCOPES];
  }

  /** Splits and checks `-a`. `*` means every client of the scope. */
  function agentsOf(command: Command, values: string[] | undefined): string[] | undefined {
    if (!values) return undefined;
    const ids = values.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
    const unknown = ids.filter((id) => id !== '*' && !CLIENT_IDS.includes(id as ClientId));
    if (unknown.length) command.error(m.errors.unknownAgents(unknown.join(', ')));
    return ids;
  }

  function presetOf(command: Command, opts: InstallOpts): Preset {
    if (opts.global && opts.project) command.error(m.errors.exclusive('--global', '--project'));
    return { agents: agentsOf(command, opts.agent), scope: opts.global ? 'user' : opts.project ? 'project' : undefined };
  }

  /** Clients of `scope` among those asked; one without that scope is an error. */
  function clientsFor(command: Command, scope: Scope, agents: string[]): ClientId[] {
    if (agents.includes('*')) return clientsIn(scope);
    try {
      return clientsForScope(scope, agents);
    } catch (error) {
      fail(command, error);
    }
  }

  function detected(ctx: OperateContext): ClientId[] {
    return detectClients(deps.exists ?? existsSync, operateContext(ctx));
  }

  /** Remembered clients and scope, else the detected clients in the project. */
  function defaults(ctx: OperateContext): { agents: ClientId[]; scope: Scope } {
    return { agents: ctx.config?.agents?.length ? ctx.config.agents : detected(ctx), scope: ctx.config?.scope ?? 'project' };
  }

  function themesOf(command: Command, catalog: Catalog, themes: string[] | undefined): string[] | undefined {
    if (!themes) return undefined;
    return themes.map((theme) => {
      const found = catalog.themes.find((item) => item.id === theme || themeLabel(item).toLowerCase() === theme.toLowerCase());
      if (!found) command.error(m.errors.unknownTheme(theme));
      return found.id;
    });
  }

  /** Prints each warning sign; a high risk leaves the server out unless the audit is off. */
  function auditGate(catalog: Catalog, ids: string[], ctx: OperateContext, enabled: boolean | undefined): { kept: string[]; excluded: string[] } {
    if (!auditEnabled(ctx.config ?? {}, enabled)) return { kept: ids, excluded: [] };
    const excluded: string[] = [];
    for (const id of ids) {
      const server = catalog.servers.find((item) => item.id === id);
      if (!server) continue;
      const result = auditServer(server);
      for (const risk of result.risks.filter((item) => item.level !== 'info')) {
        err(paint(risk.level === 'high' ? 'red' : 'yellow', `  ${m.tree.riskLevels[risk.level]} · ${risk.code}  ${id}  ${risk.detail}`));
      }
      if (failsAudit(result)) {
        err(paint('red', `✗ ${c.auditSkipped(id)}`));
        excluded.push(id);
      }
    }
    return { kept: ids.filter((id) => !excluded.includes(id)), excluded };
  }

  /** Uninstalls, installs and updates what the wizard (or the flags) chose. Returns the summary line. */
  async function apply(catalog: Catalog, result: WizardResult, ctx: OperateContext, dryRun: boolean): Promise<string> {
    const r = m.run;
    const log = (line: string) => out(line);
    let removed = 0;
    for (const item of result.remove) {
      const done = await uninstallEverywhere(catalog, [item.id], item.scopes, ctx, { dryRun, log });
      if (done.some((x) => x.written)) removed += 1;
    }
    let installed = 0;
    for (const id of result.ids) {
      try {
        const outcome = await installServers({
          catalog,
          ids: [id],
          clients: result.options.agents,
          scope: result.options.scope,
          ctx,
          yes: !dryRun,
          dryRun,
          acceptHighRisk: true,
          policy: 'skip',
          log,
        });
        if (outcome.written) installed += 1;
      } catch (error) {
        // One server that cannot be planned (no package, no remote, bad key) must not stop the others.
        if (!(error instanceof CommandError || error instanceof PlanError || error instanceof ClientPathError)) throw error;
        err(paint('red', `✗ ${id}: ${error.message}`));
      }
    }
    const rows = result.update.length ? outdatedAll(catalog, ctx, SCOPES).filter((row) => row.status === 'outdated' && result.update.includes(row.id)) : [];
    const updated = await updateRows(catalog, rows, ctx, { dryRun, log });
    if (dryRun) return '';
    if (result.ids.length) saveConfig(ctx, { ...ctx.config, agents: result.options.agents, scope: result.options.scope });
    const parts = [
      result.ids.length ? paint(installed === result.ids.length ? 'magenta' : 'yellow', r.summaryInstalled(installed, result.ids.length)) : '',
      result.remove.length ? paint(removed === result.remove.length ? 'magenta' : 'yellow', r.summaryRemoved(removed, result.remove.length)) : '',
      rows.length ? paint(updated === rows.length ? 'magenta' : 'yellow', r.summaryUpdated(updated, rows.length)) : '',
    ].filter(Boolean);
    const summary = parts.join(paint('dim', '  ·  ')) || paint('dim', r.noChange);
    out(summary);
    return summary;
  }

  /** Installs servers by id, asking only for what the flags left open (the tree is skipped). */
  async function installIds(command: Command, catalog: Catalog, ids: string[], opts: InstallOpts): Promise<void> {
    const known = new Set(catalog.servers.map((server) => server.id));
    for (const id of ids) {
      try {
        parseId(id);
      } catch (error) {
        fail(command, error);
      }
      if (!known.has(id)) command.error(m.errors.unknownServer(id));
    }
    const preset = presetOf(command, opts);
    if (!preset.agents && (opts.yes || !interactive())) command.error(m.errors.agentRequired);
    const ctx = machine();
    const base = defaults(ctx);
    if (preset.agents && (opts.yes || preset.scope)) {
      const scope = preset.scope ?? base.scope;
      const agents = clientsFor(command, scope, preset.agents);
      const { kept, excluded } = auditGate(catalog, ids, ctx, opts.audit);
      if (kept.length) await apply(catalog, { ids: kept, remove: [], update: [], options: { agents, scope } }, ctx, opts.dryRun === true);
      if (excluded.length) command.error(excluded.map((id) => c.auditSkipped(id)).join('\n'));
      return;
    }
    const chosen = await wizard(
      {
        themes: [],
        servers: catalog.servers.filter((server) => ids.includes(server.id)),
        preset: { agents: preset.agents && (preset.agents.includes('*') ? [...CLIENT_IDS] : (preset.agents as ClientId[])), scope: preset.scope },
        defaults: base,
        detectedAgents: detected(ctx),
        initialIds: ids,
        audit: auditEnabled(ctx.config ?? {}, opts.audit),
      },
      opts,
    );
    if (!chosen) return out(paint('dim', m.run.noChange));
    await apply(catalog, chosen, ctx, opts.dryRun === true);
  }

  async function wizard(props: WizardProps, opts: InstallOpts): Promise<WizardResult | null> {
    const run = deps.runWizard ?? (async (p: WizardProps, mouse: boolean) => (await import('./ui/run.js')).runWizard(p, mouse));
    return run(props, opts.mouse !== false);
  }

  const program = new Command()
    .name('mcp-atlas')
    .description(c.description)
    .version(pkg.version)
    .addOption(new Option('-l, --lang <code>', c.lang))
    .option('--offline', c.offline)
    .option('--refresh', c.refresh)
    .option('--catalog <path|url>', c.catalog)
    .addHelpText('beforeAll', () => (colored ? `\n${logo(process.stdout.columns)}\n` : ''));

  const filterOptions = (cmd: Command) =>
    cmd
      .option('-t, --theme <ids...>', c.theme)
      .option('-q, --search <text>', c.search)
      .option('--official', c.official)
      .option('-i, --installable', c.installable)
      .option('--all', c.all)
      .addOption(new Option('-s, --sort <order>', c.sort).choices(SORT_ORDERS));
  const scopeOptions = (cmd: Command) => cmd.option('-g, --global', c.global).option('-p, --project', c.project);
  const installOptions = (cmd: Command) =>
    scopeOptions(cmd.option('-a, --agent <ids...>', c.agent))
      .option('-y, --yes', c.yes)
      .option('--dry-run', c.dryRun)
      .option('--no-audit', c.noAudit)
      .option('--no-mouse', c.noMouse);

  filterOptions(installOptions(program.command('browse', { isDefault: true })))
    .description(c.browse)
    .action(async function (this: Command) {
      const opts = this.opts() as FilterOpts & InstallOpts;
      if (!interactive()) this.error(m.errors.needsTty);
      const catalog = await catalogFor(this);
      const servers = searchServers(catalog.servers, { query: opts.search, themes: themesOf(this, catalog, opts.theme), official: opts.official, sort: opts.sort });
      if (!servers.length) this.error(m.errors.noMatch);
      const preset = presetOf(this, opts);
      const ctx = machine();
      const flags = flagsFrom(this);
      const newer = (deps.newerVersion ?? (() => newerVersion(pkg.version, { offline: flags.offline })))();
      const versionNotice = newer ? paint('dim', c.newVersion(newer, pkg.version)) : '';
      const treeMemory = {};
      const runs = await browseLoop(
        (notice) =>
          wizard(
            {
              themes: catalog.themes,
              servers,
              allServers: catalog.servers,
              preset: { agents: preset.agents && (preset.agents.includes('*') ? [...CLIENT_IDS] : (preset.agents as ClientId[])), scope: preset.scope },
              defaults: defaults(machine()),
              detectedAgents: detected(ctx),
              loadInstalled: async (scopes) => ({
                installed: installedMap(catalog, ctx, scopes),
                updates: new Set(outdatedAll(catalog, ctx, scopes).filter((row) => row.status === 'outdated').map((row) => row.id)),
              }),
              sort: opts.sort,
              search: opts.search,
              official: opts.official,
              installable: opts.installable,
              notice: notice || versionNotice,
              treeMemory,
              audit: auditEnabled(machine().config ?? {}, opts.audit),
              loadPreview: (server) => readReadme(catalog, server.id, { fetch: deps.fetch }),
            },
            opts,
          ),
        (result) => apply(catalog, result, machine(), opts.dryRun === true),
        opts,
      );
      if (!runs) out(paint('dim', m.run.noChange));
    });

  filterOptions(program.command('list'))
    .description(c.list)
    .option('-n, --limit <n>', c.limit)
    .option('--json', c.json)
    .action(async function (this: Command) {
      const opts = this.opts() as FilterOpts & { limit?: string; json?: boolean };
      let limit: number | undefined;
      if (opts.limit !== undefined) {
        limit = Number(opts.limit);
        if (!Number.isInteger(limit) || limit < 1) this.error(m.errors.positive('-n'));
      }
      const catalog = await catalogFor(this);
      const found = searchServers(catalog.servers, { query: opts.search, themes: themesOf(this, catalog, opts.theme), official: opts.official, installable: opts.installable, all: opts.all, sort: opts.sort });
      const rows = limit === undefined ? found : found.slice(0, limit);
      if (opts.json) return out(JSON.stringify(rows, null, 2));
      for (const server of rows) out(`${server.id}\t${server.title ?? server.name}${server.official ? '\tofficial' : ''}`);
    });

  program
    .command('themes')
    .description(c.themes)
    .option('--official', c.official)
    .option('--all', c.all)
    .option('--json', c.json)
    .action(async function (this: Command) {
      const opts = this.opts() as { official?: boolean; json?: boolean };
      const catalog = await catalogFor(this);
      const servers = searchServers(catalog.servers, { official: opts.official });
      const rows = catalog.themes.map((theme) => ({
        id: theme.id,
        label: themeLabel(theme),
        count: servers.filter((server) => server.themes.includes(theme.id)).length,
      }));
      if (opts.json) return out(JSON.stringify(rows, null, 2));
      if (colored) out(`\n${paint('bold', c.catalogOf(catalog.generatedAt.slice(0, 10), formatNumber(servers.length)))}\n`);
      for (const theme of rows) out(`${theme.id}\t${theme.label}\t${theme.count}`);
    });

  program
    .command('agents')
    .alias('clients')
    .description(c.agentsCmd)
    .option('--json', c.json)
    .action(function (this: Command) {
      const opts = this.opts() as { json?: boolean };
      const found = new Set(detected(machine()));
      const rows = CLIENT_IDS.map((id) => ({ id, detected: found.has(id) }));
      if (opts.json) return out(JSON.stringify(rows, null, 2));
      for (const row of rows) out(`${row.detected ? paint('magenta', '★') : ' '} ${row.id}${row.detected ? ` ${c.detected}` : ''}`);
    });

  program
    .command('show')
    .description(c.showCmd)
    .argument('<id>', c.ids)
    .option('--json', c.json)
    .action(async function (this: Command, id: string) {
      const opts = this.opts() as { json?: boolean };
      try {
        parseId(id);
        const catalog = await catalogFor(this);
        const server = catalog.servers.find((item) => item.id === id);
        if (!server) this.error(m.errors.unknownServer(id));
        const risks = auditServer(server).risks;
        const readme = await readReadme(catalog, id, { fetch: deps.fetch });
        if (opts.json) {
          return out(JSON.stringify({ id: server.id, name: server.name, title: server.title, description: server.description, command: commandText(server), risks, readme }));
        }
        // The warning signs go to stderr: stdout stays the README alone, to pipe or save.
        if (risks.length > 0) err(risks.map((risk) => `${risk.level} ${risk.code} ${risk.detail}`).join('\n'));
        stdout(readme.endsWith('\n') ? readme : `${readme}\n`);
      } catch (error) {
        fail(this, error);
      }
    });

  installOptions(program.command('install'))
    .description(c.install)
    .argument('[ids...]', c.ids)
    .option('--pack <ids...>', c.packOption)
    .action(async function (this: Command, ids: string[]) {
      const opts = this.opts() as InstallOpts & { pack?: string[] };
      if (!opts.pack && !ids.length) this.error(c.nothingToInstall);
      const catalog = await catalogFor(this);
      let wanted = ids;
      if (opts.pack) {
        const all = packs();
        const unknown = opts.pack.filter((id) => !all.some((pack) => pack.id === id));
        if (unknown.length) this.error(c.unknownPacks(unknown.join(', ')));
        const fromPacks = all.filter((pack) => opts.pack!.includes(pack.id)).flatMap((pack) => pack.servers);
        const known = new Set(catalog.servers.map((server) => server.id));
        wanted = [...new Set([...ids, ...fromPacks.filter((id) => known.has(id))])];
      }
      await installIds(this, catalog, wanted, opts);
    });

  scopeOptions(program.command('uninstall').option('-a, --agent <ids...>', c.agent))
    .description(c.uninstall)
    .argument('<ids...>', c.ids)
    .option('--dry-run', c.dryRun)
    .action(async function (this: Command, ids: string[]) {
      const opts = this.opts() as InstallOpts;
      const scopes = scopesOf(this, opts);
      const only = agentsOf(this, opts.agent)?.filter((id): id is ClientId => id !== '*');
      const catalog = await catalogFor(this);
      for (const id of ids) {
        try {
          parseId(id);
        } catch (error) {
          fail(this, error);
        }
      }
      const ctx = machine();
      const present = installedMap(catalog, ctx, scopes, only);
      const missing = ids.filter((id) => !present.has(id));
      if (missing.length) this.error(`${missing.join(', ')}: ${c.noneInstalled}`);
      await uninstallEverywhere(catalog, ids, scopes, ctx, { dryRun: opts.dryRun === true, log: (line) => out(line), only });
      if (!opts.dryRun) out(paint('magenta', m.run.summaryRemoved(ids.length, ids.length)));
    });

  /** Matches of every scope asked, each with its scope. */
  function matchesIn(catalog: Catalog, ctx: OperateContext, scopes: Scope[], only?: ClientId[]) {
    const found = installedEntries(catalog, ctx, scopes, only).map(({ value: _value, ...entry }) => entry);
    return {
      matches: found.filter((entry) => !entry.id.startsWith(LOCAL_PREFIX)),
      unknown: found.filter((entry) => entry.id.startsWith(LOCAL_PREFIX)).map(({ id: _id, ...entry }) => entry),
    };
  }

  scopeOptions(program.command('installed').option('-a, --agent <ids...>', c.agent))
    .description(c.installedCmd)
    .option('--json', c.json)
    .action(async function (this: Command) {
      const opts = this.opts() as InstallOpts & { json?: boolean };
      const only = agentsOf(this, opts.agent)?.filter((id): id is ClientId => id !== '*');
      const { matches, unknown } = matchesIn(await catalogFor(this), machine(), scopesOf(this, opts), only);
      if (opts.json) return out(JSON.stringify({ matches, unknown }, null, 2));
      if (!matches.length) out(paint('dim', c.noneInstalled));
      for (const match of matches) out(`${match.id}\t${match.key}\t${m.tree.where[match.scope]}\t${match.path}\t${match.clients.join(',')}`);
      for (const entry of unknown) err(`unknown\t${entry.key}\t${entry.path}`);
    });

  scopeOptions(program.command('export').option('-a, --agent <ids...>', c.agent))
    .description(c.exportCmd)
    .action(async function (this: Command) {
      const opts = this.opts() as InstallOpts;
      const only = agentsOf(this, opts.agent)?.filter((id): id is ClientId => id !== '*');
      out(JSON.stringify(exportBundle(matchesIn(await catalogFor(this), machine(), scopesOf(this, opts), only)), null, 2));
    });

  installOptions(program.command('import'))
    .description(c.importCmd)
    .argument('<file>', c.fileArg)
    .action(async function (this: Command, file: string) {
      const opts = this.opts() as InstallOpts;
      let ids: string[];
      try {
        ids = [...new Set(parseBundle(readFileSync(file, 'utf8')).servers)];
      } catch (error) {
        fail(this, error instanceof Error && !(error instanceof BundleError) && !(error instanceof IdError) ? new BundleError(error.message) : error);
      }
      if (!ids.length) return out(paint('dim', m.run.noChange));
      await installIds(this, await catalogFor(this), ids, opts);
    });

  scopeOptions(program.command('outdated').option('-a, --agent <ids...>', c.agent))
    .description(c.outdatedCmd)
    .option('--json', c.json)
    .action(async function (this: Command) {
      const opts = this.opts() as InstallOpts & { json?: boolean };
      const only = agentsOf(this, opts.agent)?.filter((id): id is ClientId => id !== '*');
      const rows = outdatedAll(await catalogFor(this), machine(), scopesOf(this, opts), only);
      if (opts.json) return out(JSON.stringify(rows, null, 2));
      for (const row of rows) out(`${row.id}\t${c.status[row.status]}\t${row.installed ?? ''}\t${row.catalog ?? ''}`);
      if (rows.some((row) => row.status === 'outdated')) out(paint('dim', `\n${c.outdatedHint}\n${c.updateAllHint}`));
    });

  scopeOptions(program.command('update').option('-a, --agent <ids...>', c.agent))
    .description(c.updateCmd)
    .argument('[ids...]', c.ids)
    .option('--dry-run', c.dryRun)
    .option('--no-audit', c.noAudit)
    .action(async function (this: Command, ids: string[]) {
      const opts = this.opts() as InstallOpts;
      const only = agentsOf(this, opts.agent)?.filter((id): id is ClientId => id !== '*');
      const catalog = await catalogFor(this);
      const ctx = machine();
      // Named servers are updated only if they are outdated: rewriting a current one changes nothing.
      const rows = outdatedAll(catalog, ctx, scopesOf(this, opts), only).filter((row) => row.status === 'outdated' && (!ids.length || ids.includes(row.id)));
      if (!rows.length) return out(paint('dim', c.upToDate));
      for (const row of rows) out(`  ${paint('magenta', '↑')} ${row.id}  ${row.installed} -> ${row.catalog}  ${row.path}`);
      // A new version is new content: it is audited like an install.
      const { kept } = auditGate(catalog, [...new Set(rows.map((row) => row.id))], ctx, opts.audit);
      const chosen: ScopedRow[] = rows.filter((row) => kept.includes(row.id));
      if (!chosen.length) return out(paint('dim', m.run.noChange));
      const done = await updateRows(catalog, chosen, ctx, { dryRun: opts.dryRun === true, log: (line) => out(line) });
      if (!opts.dryRun) out(paint('magenta', m.run.summaryUpdated(done, chosen.length)));
    });

  program
    .command('lock')
    .description(c.lockCmd)
    .option('--dry-run', c.dryRun)
    .action(async function (this: Command) {
      const opts = this.opts() as { dryRun?: boolean };
      const catalog = await catalogFor(this);
      try {
        const changes = lockProject(join(machine().cwd, PROJECT_FILE), catalog, opts.dryRun === true);
        if (!changes.length) return out(paint('dim', c.lockUnchanged));
        for (const change of changes) out(`${change.id}: ${change.previous ?? '-'} -> ${change.version}`);
      } catch (error) {
        this.error(c.syncFailed(PROJECT_FILE, (error as NodeJS.ErrnoException).code === 'ENOENT' ? c.syncNoFile : (error as Error).message));
      }
    });

  installOptions(program.command('sync'))
    .description(c.syncCmd)
    .option('--check', c.syncCheck)
    .action(async function (this: Command) {
      const opts = this.opts() as InstallOpts & { check?: boolean };
      const ctx = machine();
      let file: ReturnType<typeof readProjectFile>;
      try {
        file = readProjectFile(join(ctx.cwd, PROJECT_FILE));
      } catch (error) {
        this.error(c.syncFailed(PROJECT_FILE, (error as NodeJS.ErrnoException).code === 'ENOENT' ? c.syncNoFile : (error as Error).message));
      }
      const asked = agentsOf(this, opts.agent) ?? file.agents;
      if (!asked?.length) this.error(m.errors.agentRequired);
      const clients = clientsFor(this, 'project', asked);
      // The project's pins replace the catalog's versions for the servers it lists.
      const catalog = withPins(await catalogFor(this), file.versions);
      const known = new Set(catalog.servers.map((server) => server.id));
      const unknown = file.servers.filter((id) => !known.has(id));
      if (unknown.length) this.error(m.errors.unknownServer(unknown.join(', ')));
      const drift = outdatedAll(catalog, ctx, ['project'], clients).filter(
        (row) => file.servers.includes(row.id) && file.versions?.[row.id] !== undefined && row.status !== 'current',
      );
      // Clients missing the same servers are written together.
      const groups = new Map<string, { clients: ClientId[]; ids: string[] }>();
      for (const client of clients) {
        const present = new Set(installedMap(catalog, ctx, ['project'], [client]).keys());
        const ids = file.servers.filter((id) => !present.has(id) && !drift.some((row) => row.id === id && row.clients.includes(client)));
        if (!ids.length) continue;
        const key = ids.join('\n');
        groups.set(key, { clients: [...(groups.get(key)?.clients ?? []), client], ids });
      }
      if (!groups.size && !drift.length) return out(paint('dim', c.syncUpToDate(file.servers.length)));
      if (opts.check) {
        for (const group of groups.values()) for (const id of group.ids) out(`  ${id}  [${group.clients.join(', ')}]`);
        for (const row of drift) out(`  ${row.id}  ${row.installed ?? '?'} -> ${row.catalog}  [${row.clients.join(', ')}]`);
        this.error(c.syncMissing(new Set([...[...groups.values()].flatMap((g) => g.ids), ...drift.map((row) => row.id)]).size));
      }
      const dryRun = opts.dryRun === true;
      const failed: string[] = [];
      for (const group of groups.values()) {
        const { kept, excluded } = auditGate(catalog, group.ids, ctx, opts.audit);
        failed.push(...excluded);
        if (kept.length) await apply(catalog, { ids: kept, remove: [], update: [], options: { agents: group.clients, scope: 'project' } }, ctx, dryRun);
      }
      const { kept } = auditGate(catalog, [...new Set(drift.map((row) => row.id))], ctx, opts.audit);
      const done = await updateRows(catalog, drift.filter((row) => kept.includes(row.id)), ctx, { dryRun, log: (line) => out(line) });
      if (drift.length && !dryRun) out(paint('magenta', m.run.summaryUpdated(done, drift.length)));
      if (failed.length) this.error(failed.map((id) => c.auditSkipped(id)).join('\n'));
    });

  program
    .command('packs')
    .description(c.packsCmd)
    .option('--json', c.json)
    .action(async function (this: Command) {
      const opts = this.opts() as { json?: boolean };
      const catalog = await catalogFor(this);
      const status = packs().map((pack) => ({ ...pack, ...packStatus(pack, catalog) }));
      if (opts.json) return out(JSON.stringify(status, null, 2));
      for (const pack of status) {
        out(`\n${paint('bold', `📦 ${pack.name}`)} ${paint('dim', `${pack.id} · ${pack.available}/${pack.total}`)}\n  ${pack.description}`);
        for (const id of pack.servers) out(`  ${paint('dim', id)}`);
        if (pack.missing.length) out(paint('yellow', c.packMissing(pack.missing.join(', '))));
      }
      out(paint('dim', `\n${c.packsHint}`));
    });

  program
    .command('audit')
    .description(c.auditCmd)
    .argument('[state]', 'on | off')
    .action(function (this: Command, state?: string) {
      if (state !== undefined && state !== 'on' && state !== 'off') this.error(c.auditBadValue);
      const ctx = machine();
      if (state) saveConfig(ctx, { ...ctx.config, audit: state === 'on' });
      out(c.auditState(state ? state === 'on' : auditEnabled(ctx.config ?? {})));
    });

  scopeOptions(program.command('doctor').option('-a, --agent <ids...>', c.agent))
    .description(m.doctor.command)
    .option('--json', c.json)
    .action(function (this: Command) {
      const opts = this.opts() as InstallOpts & { json?: boolean };
      const only = agentsOf(this, opts.agent)?.filter((id): id is ClientId => id !== '*');
      const ctx = machine();
      const issues = diagnose(ctx, scopesOf(this, opts), only, { exists: deps.exists, ...deps.doctor }).map((issue) => ({
        ...issue,
        message: m.doctor.issues[issue.code],
      }));
      if (opts.json) out(JSON.stringify(issues, null, 2));
      else if (!issues.length) out(paint('dim', m.doctor.healthy));
      else for (const issue of issues) out(`  ${m.tree.where[issue.scope]} · ${issue.message}: ${issue.path}${issue.key ? ` (${issue.key}${issue.detail ? `: ${issue.detail}` : ''})` : ''}`);
      if (issues.length) process.exitCode = 1;
    });

  const langList = Object.keys(LANGUAGES).join(', ');
  program
    .command('lang')
    .description(c.langCmd)
    .argument('[code]', langList)
    .action(function (this: Command, code?: string) {
      if (!code) return out(c.langCurrent(getLang(), langList));
      const lang = normalizeLang(code);
      if (!lang) this.error(m.errors.unknownLang(code, langList));
      const ctx = machine();
      saveConfig(ctx, { ...ctx.config, lang });
      out(LANGUAGES[lang].cli.langSet(lang));
    });

  program
    .command('completion')
    .description(c.completionCmd)
    .argument('<shell>', 'bash, zsh, fish, powershell')
    .action(function (this: Command, shell: string) {
      const script = completionScript(shell);
      if (!script) this.error(c.completionShell(shell));
      stdout(script.endsWith('\n') ? script : `${script}\n`);
    });

  program
    .command('ui')
    .description(c.ui)
    .option('--port <n>', c.port)
    .option('--no-open', c.noOpen)
    .option('--demo', c.demo)
    .action(async function (this: Command) {
      const opts = this.opts() as { port?: string; open: boolean; demo?: boolean };
      let port = 0;
      if (opts.port !== undefined) {
        port = Number(opts.port);
        if (!Number.isInteger(port) || port < 0) this.error(m.errors.port);
      }
      const ctx = machine();
      const started = await (deps.startUi ?? startUi)({
        catalog: await catalogFor(this),
        demo: opts.demo === true,
        port,
        home: ctx.home,
        cwd: ctx.cwd,
        platform: ctx.platform,
        env: ctx.env,
        config: ctx.config,
      });
      out(`\n  ${m.cli.serving} ${paint(['bold', 'cyan'], started.url)}\n  ${paint('dim', c.stop)}\n`);
      if (opts.open) (deps.openBrowser ?? openBrowser)(started.url);
      await (deps.untilInterrupted ?? (() => new Promise<void>((resolve) => process.once('SIGINT', () => resolve()))))();
      await started.close();
    });

  program
    .command('mcp')
    .description(c.mcpCmd)
    .action(async function (this: Command) {
      const ctx = machine();
      const flags = flagsFrom(this);
      await (deps.serveMcp ?? serveMcp)({
        version: pkg.version,
        loadCatalog: async () => {
          const { catalog, missing } = await openRecommended(flags);
          if (missing.length > 0) err(c.ignored(missing.join(', ')));
          return catalog;
        },
        home: ctx.home,
        cwd: ctx.cwd,
        platform: ctx.platform,
        env: ctx.env,
        config: ctx.config,
      });
    });

  // Called by the completion scripts on Tab: one candidate per line, nothing else on stdout.
  program
    .command('__complete', { hidden: true })
    .argument('[words...]')
    .allowUnknownOption()
    .action(async (words: string[]) => {
      let ids: string[] = [];
      let themes: string[] = [];
      try {
        // Offline: Tab must answer at once, from the cached or bundled snapshot.
        const { catalog } = await openRecommended({ offline: true });
        ids = catalog.servers.map((server) => server.id);
        themes = catalog.themes.map((theme) => theme.id);
      } catch {
        ids = [];
      }
      const flags = (cmd: Command) => cmd.options.flatMap((o) => [o.short, o.long].filter((f): f is string => !!f));
      const candidates = complete(words.length ? words : [''], {
        commands: program.commands.filter((cmd) => !cmd.name().startsWith('_')).map((cmd) => ({ name: cmd.name(), options: flags(cmd) })),
        globalOptions: [...flags(program), '--help', '--version'],
        themes: () => themes,
        clients: [...CLIENT_IDS, '*'],
        ids: (prefix) => ids.filter((id) => id.toLowerCase().startsWith(prefix.toLowerCase())).slice(0, 50),
      });
      if (candidates.length > 0) out(candidates.join('\n'));
    });

  return program;
}

function fail(command: Command, error: unknown): never {
  if (
    error instanceof PlanError ||
    error instanceof IdError ||
    error instanceof BundleError ||
    error instanceof ReadmeError ||
    error instanceof CommandError ||
    error instanceof ClientPathError
  ) {
    command.error(error.message);
  }
  throw error;
}

/**
 * Interface language, resolved before the commands are built so that their help is translated:
 * `--lang` (remembered), then MCP_ATLAS_LANG, then the saved choice, then the system's, then English.
 */
export function resolveLang(argv: string[], env: NodeJS.ProcessEnv = process.env): Lang {
  const list = Object.keys(LANGUAGES).join(', ');
  const fromFlag = langFlag(argv);
  if (fromFlag !== undefined) {
    const lang = normalizeLang(fromFlag);
    if (!lang) {
      process.stderr.write(`mcp-atlas: ${LANGUAGES.en.errors.unknownLang(fromFlag, list)}\n`);
      process.exit(1);
    }
    const config = readConfig();
    if (config.lang !== lang) {
      writeConfig({ ...config, lang });
      process.stderr.write(`${LANGUAGES[lang].cli.langSet(lang)}\n`);
    }
    return lang;
  }
  return normalizeLang(env.MCP_ATLAS_LANG) ?? normalizeLang(readConfig().lang) ?? systemLang(env) ?? 'en';
}

export async function run(argv: string[]): Promise<void> {
  setLang(resolveLang(argv.slice(2)));
  await createProgram().parseAsync(argv);
  // Nothing should outlive the command (stdin, sockets kept alive by fetch). Exit once stdout is flushed.
  process.stdout.write('', () => process.exit(process.exitCode ?? 0));
}
