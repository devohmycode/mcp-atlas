import { clientConfigPath, clientSpec, type PathContext } from './clients.js';
import { CommandError, proposeCommand } from './command.js';
import { readConfigFile } from './mcp-config.js';
import type { Catalog, ClientId, Scope } from './types.js';

export interface InstalledMatch {
  id: string;
  key: string;
  path: string;
  clients: ClientId[];
}

export interface UnknownEntry {
  key: string;
  path: string;
  clients: ClientId[];
}

export interface InstalledResult {
  matches: InstalledMatch[];
  unknown: UnknownEntry[];
}

export interface InstalledInput {
  catalog: Catalog;
  clients: readonly ClientId[];
  scope: Scope;
  ctx: PathContext;
  /** Existing file text, keyed by the absolute path. A missing path is empty, not an error. */
  files?: ReadonlyMap<string, string>;
}

/**
 * Re-reads each client's file and attaches an entry to a catalog id by command
 * and arguments, or by URL. Clients that share a path (Codex) are one group.
 * The first catalog fiche that matches wins. An unknown key is listed apart.
 */
export function readInstalled(input: InstalledInput): InstalledResult {
  const groups = new Map<string, { clients: ClientId[]; format: 'json' | 'toml' }>();
  for (const id of input.clients) {
    const path = clientConfigPath(id, input.scope, input.ctx);
    const existing = groups.get(path);
    if (existing) {
      existing.clients.push(id);
      continue;
    }
    groups.set(path, { clients: [id], format: clientSpec(id).format });
  }

  const matches: InstalledMatch[] = [];
  const unknown: UnknownEntry[] = [];
  for (const [path, group] of groups) {
    if (!input.files?.has(path)) continue;
    const file = readConfigFile(group.format, input.files.get(path), path);
    const clients = [...group.clients];
    for (const [key, value] of Object.entries(file.servers)) {
      const id = matchId(input.catalog, value);
      if (id) matches.push({ id, key, path, clients });
      else unknown.push({ key, path, clients });
    }
  }
  return { matches, unknown };
}

/** Proposed command of every fiche, keyed by its URL or its command and arguments; the first fiche wins. */
const indexes = new WeakMap<Catalog, Map<string, string>>();

function commandIndex(catalog: Catalog): Map<string, string> {
  let index = indexes.get(catalog);
  if (index) return index;
  index = new Map();
  for (const server of catalog.servers) {
    let proposed;
    try {
      proposed = proposeCommand(server);
    } catch (err) {
      if (err instanceof CommandError) continue;
      throw err;
    }
    const key = proposed.kind === 'remote' ? urlKey(proposed.url) : commandKey(proposed.command, proposed.args);
    if (!index.has(key)) index.set(key, server.id);
  }
  indexes.set(catalog, index);
  return index;
}

const urlKey = (url: string) => `url\u0000${url}`;
const commandKey = (command: string, args: readonly string[]) => [command, ...args].join('\u0000');

/**
 * `env` is not part of the match. Argument order is. The first fiche wins.
 * The index is built once per catalog: scanning every fiche per entry took seconds on 150,000 fiches.
 */
function matchId(catalog: Catalog, value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const index = commandIndex(catalog);
  const byUrl = typeof record.url === 'string' ? index.get(urlKey(record.url)) : undefined;
  if (byUrl) return byUrl;
  const args = record.args;
  if (typeof record.command !== 'string' || !Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) return undefined;
  return index.get(commandKey(record.command, args));
}
