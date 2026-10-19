import { applyRemoval, type ApplyResult } from './apply.js';
import { CLIENTS, clientSpec } from './clients.js';
import { readInstalled } from './installed.js';
import { installServers, operateContext, readClientFiles, type OperateContext } from './operate.js';
import { readConfigFile } from './mcp-config.js';
import { outdatedEntries, serverByIdentity, type OutdatedRow } from './outdated.js';
import type { Catalog, ClientId, Scope, Server } from './types.js';

/** Where a server is installed: the scopes and clients whose files hold it. */
export interface InstalledEntry {
  scopes: Scope[];
  clients: ClientId[];
  /** Set for an entry that matches no catalog fiche: a stand-in fiche, so that the tree can show and untick it. */
  local?: Server;
}

/** Id of an installed entry that matches no fiche: one per config key. */
export const LOCAL_PREFIX = 'local:';

/** Clients that have `scope`, limited to `only` when given. Never throws on a client without that scope. */
export function clientsIn(scope: Scope, only?: readonly ClientId[]): ClientId[] {
  return CLIENTS.filter((spec) => spec.scopes.includes(scope) && (!only?.length || only.includes(spec.id))).map((spec) => spec.id);
}

/** One server key of one client file. */
interface FoundEntry {
  /** Catalog id, or `local:<key>` when no fiche matches. */
  id: string;
  key: string;
  path: string;
  scope: Scope;
  clients: ClientId[];
  value: unknown;
}

/**
 * Every server key of the client files of `scopes`. An entry is attached to a fiche by its exact command,
 * else by package or URL (another version or other arguments), else it stays local.
 */
export function installedEntries(catalog: Catalog, ctx: OperateContext, scopes: readonly Scope[], only?: readonly ClientId[]): FoundEntry[] {
  const out: FoundEntry[] = [];
  for (const scope of scopes) {
    const clients = clientsIn(scope, only);
    const files = readClientFiles(clients, scope, ctx);
    const found = readInstalled({ catalog, clients, scope, ctx: operateContext(ctx), files });
    const valueOf = (path: string, key: string, ids: readonly ClientId[]) =>
      readConfigFile(clientSpec(ids[0] ?? 'cursor').format, files.get(path), path).servers[key];
    for (const match of found.matches) out.push({ ...match, scope, value: valueOf(match.path, match.key, match.clients) });
    for (const entry of found.unknown) {
      const value = valueOf(entry.path, entry.key, entry.clients);
      const id = serverByIdentity(catalog, value)?.id ?? remoteMatch(catalog, value) ?? `${LOCAL_PREFIX}${entry.key}`;
      out.push({ ...entry, id, scope, value });
    }
  }
  return out;
}

/** A remote entry whose URL is a fiche's remote, query string aside. */
function remoteMatch(catalog: Catalog, value: unknown): string | undefined {
  const url = (value as { url?: unknown } | null)?.url;
  if (typeof url !== 'string') return undefined;
  const bare = url.split('?')[0];
  return catalog.servers.find((server) => server.remotes.some((remote) => remote.url.split('?')[0] === bare))?.id;
}

/** The stand-in fiche of a local entry: its key as name, its command as description. */
function localServer(entry: FoundEntry): Server {
  const value = (entry.value ?? {}) as { command?: unknown; args?: unknown; url?: unknown };
  const command = typeof value.url === 'string' ? value.url : [value.command, ...(Array.isArray(value.args) ? value.args : [])].filter((part) => typeof part === 'string').join(' ');
  return { id: entry.id, name: entry.key, title: entry.key, description: command, packages: [], remotes: [], origins: [], themes: [], official: false, singleRegistry: false };
}

/** Installed servers of `scopes`, catalog fiches and local entries alike. */
export function installedMap(catalog: Catalog, ctx: OperateContext, scopes: readonly Scope[], only?: readonly ClientId[]): Map<string, InstalledEntry> {
  const map = new Map<string, InstalledEntry>();
  for (const found of installedEntries(catalog, ctx, scopes, only)) {
    const entry = map.get(found.id) ?? { scopes: [], clients: [], local: found.id.startsWith(LOCAL_PREFIX) ? localServer(found) : undefined };
    if (!entry.scopes.includes(found.scope)) entry.scopes.push(found.scope);
    for (const client of found.clients) if (!entry.clients.includes(client)) entry.clients.push(client);
    map.set(found.id, entry);
  }
  return map;
}

export type ScopedRow = OutdatedRow & { scope: Scope };

/** Version check of every pinned entry in `scopes`. */
export function outdatedAll(catalog: Catalog, ctx: OperateContext, scopes: readonly Scope[], only?: readonly ClientId[]): ScopedRow[] {
  return scopes.flatMap((scope) => {
    const clients = clientsIn(scope, only);
    return outdatedEntries({ catalog, clients, scope, ctx: operateContext(ctx), files: readClientFiles(clients, scope, ctx) }).map((row) => ({ ...row, scope }));
  });
}

export interface ChangeOptions {
  dryRun?: boolean;
  log?: (line: string) => void;
}

/** Uninstalls each id (a fiche, or `local:<key>`) from every file of `scopes` that holds it. */
export async function uninstallEverywhere(
  catalog: Catalog,
  ids: readonly string[],
  scopes: readonly Scope[],
  ctx: OperateContext,
  opts: ChangeOptions & { only?: readonly ClientId[] } = {},
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  for (const found of installedEntries(catalog, ctx, scopes, opts.only)) {
    if (!ids.includes(found.id)) continue;
    const format = clientSpec(found.clients[0] ?? 'cursor').format;
    results.push(await applyRemoval({ path: found.path, format, key: found.key }, { dryRun: opts.dryRun, log: opts.log }));
  }
  return results;
}

/**
 * Replaces each outdated entry by the catalog's command, for the same clients and scope.
 * The caller has audited them. Returns how many entries were rewritten.
 */
export async function updateRows(catalog: Catalog, rows: readonly ScopedRow[], ctx: OperateContext, opts: ChangeOptions = {}): Promise<number> {
  const log = opts.log ?? (() => {});
  let done = 0;
  for (const row of rows) {
    if (opts.dryRun) {
      log(`update ${row.id} in ${row.path}: ${row.installed ?? '?'} -> ${row.catalog ?? '?'}`);
      continue;
    }
    const format = clientSpec(row.clients[0] ?? 'cursor').format;
    await applyRemoval({ path: row.path, format, key: row.key }, { log });
    const outcome = await installServers({ catalog, ids: [row.id], clients: row.clients, scope: row.scope, ctx, yes: true, acceptHighRisk: true, policy: 'skip', log });
    if (outcome.written) done += 1;
  }
  return done;
}
