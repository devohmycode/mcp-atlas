import { clientSpec } from './clients.js';
import { CommandError, proposeCommand, type ProposedCommand } from './command.js';
import { readInstalled, type InstalledInput } from './installed.js';
import { readConfigFile } from './mcp-config.js';
import type { Catalog, ClientId, Server } from './types.js';

export type VersionStatus = 'current' | 'outdated' | 'unknown';

export interface OutdatedRow {
  id: string;
  key: string;
  path: string;
  /** Clients that read this file. */
  clients: ClientId[];
  /** Version pinned in the config, when the entry has one. */
  installed?: string;
  /** Version the catalog would install now, when it has one. */
  catalog?: string;
  /**
   * `unknown` when the config has no pin. That is not `current`.
   * `outdated` when both sides have a pin and they differ.
   */
  status: VersionStatus;
}

/**
 * Compares each matched entry's pin with the catalog. A different pin does not
 * exact-match the installed command, so those entries are recognised by package
 * identity. Unknown keys that match no fiche stay out.
 */
export function outdatedEntries(input: InstalledInput): OutdatedRow[] {
  const found = readInstalled(input);
  const byId = new Map(input.catalog.servers.map((server) => [server.id, server]));
  const rows: OutdatedRow[] = [];
  for (const match of found.matches) {
    const server = byId.get(match.id);
    if (!server) continue;
    rows.push(rowFor(server, match.key, match.path, match.clients, entryValue(input, match.path, match.key, match.clients)));
  }
  for (const entry of found.unknown) {
    const value = entryValue(input, entry.path, entry.key, entry.clients);
    const server = serverByIdentity(input.catalog, value);
    if (!server) continue;
    rows.push(rowFor(server, entry.key, entry.path, entry.clients, value));
  }
  return rows;
}

/** No pin in the config is unknown, never up to date. */
export function compareVersions(installed: string | undefined, catalog: string | undefined): VersionStatus {
  if (!installed || !catalog) return 'unknown';
  return installed === catalog ? 'current' : 'outdated';
}

function rowFor(server: Server, key: string, path: string, clients: ClientId[], value: unknown): OutdatedRow {
  const installed = versionOfEntry(value);
  const catalog = catalogPin(server);
  return { id: server.id, key, path, clients, installed, catalog, status: compareVersions(installed, catalog) };
}

function entryValue(input: InstalledInput, path: string, key: string, clients: readonly ClientId[]): unknown {
  const format = clientSpec(clients[0] ?? 'cursor').format;
  return readConfigFile(format, input.files?.get(path), path).servers[key];
}

/** Same command and package name, ignoring the pin. The first fiche wins. */
export function serverByIdentity(catalog: Catalog, value: unknown): Server | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as { command?: unknown; args?: unknown };
  if (typeof record.command !== 'string' || !Array.isArray(record.args)) return undefined;
  const args = record.args.filter((arg): arg is string => typeof arg === 'string');
  const names = new Set(args.map(packageName).filter((name): name is string => name !== undefined));
  if (names.size === 0) return undefined;
  const index = identityIndex(catalog);
  // The fiche that comes first in the catalog wins, as when every fiche was scanned in order.
  let best: { server: Server; order: number } | undefined;
  for (const name of names) {
    const found = index.get(`${record.command}\u0000${name}`);
    if (found && (!best || found.order < best.order)) best = found;
  }
  return best?.server;
}

/** Stdio fiches keyed by command and package name, built once per catalog. */
const identities = new WeakMap<Catalog, Map<string, { server: Server; order: number }>>();

function identityIndex(catalog: Catalog): Map<string, { server: Server; order: number }> {
  let index = identities.get(catalog);
  if (index) return index;
  index = new Map();
  catalog.servers.forEach((server, order) => {
    let proposed: ProposedCommand;
    try {
      proposed = proposeCommand(server);
    } catch (err) {
      if (err instanceof CommandError) return;
      throw err;
    }
    if (proposed.kind !== 'stdio') return;
    for (const arg of proposed.args) {
      const name = packageName(arg);
      const key = `${proposed.command}\u0000${name}`;
      if (name !== undefined && !index!.has(key)) index!.set(key, { server, order });
    }
  });
  identities.set(catalog, index);
  return index;
}

function packageName(arg: string): string | undefined {
  if (arg.startsWith('-') || arg.includes('://')) return undefined;
  const py = /^([A-Za-z0-9_.-]+)==/.exec(arg);
  if (py?.[1]) return py[1];
  if (!arg.startsWith('@') && arg.includes(':')) return arg.slice(0, arg.lastIndexOf(':'));
  const at = arg.lastIndexOf('@');
  if (at > 0) return arg.slice(0, at);
  if (/^(@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(arg)) return arg;
  return undefined;
}

export function catalogPin(server: Pick<Server, 'version' | 'packages' | 'remotes'>): string | undefined {
  try {
    return versionOfCommand(proposeCommand(server));
  } catch (err) {
    if (err instanceof CommandError) return undefined;
    throw err;
  }
}

function versionOfCommand(command: ProposedCommand): string | undefined {
  if (command.kind === 'remote' || command.unpinned) return undefined;
  return versionInArgs(command.args);
}

function versionOfEntry(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as { args?: unknown };
  if (!Array.isArray(record.args)) return undefined;
  return versionInArgs(record.args.filter((arg): arg is string => typeof arg === 'string'));
}

function versionInArgs(args: readonly string[]): string | undefined {
  for (const arg of args) {
    if (arg.startsWith('-') || arg.includes('://')) continue;
    const py = /^[A-Za-z0-9_.-]+==(.+)$/.exec(arg);
    if (py?.[1]) return py[1];
    if (!arg.startsWith('@') && arg.includes(':')) {
      const tag = arg.slice(arg.lastIndexOf(':') + 1);
      if (tag) return tag;
    }
    const at = arg.lastIndexOf('@');
    if (at > 0) return arg.slice(at + 1);
  }
  return undefined;
}
