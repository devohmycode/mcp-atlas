import { proposeCommand } from './command.js';
import type { Catalog, Server } from './types.js';

export const SORT_ORDERS = ['official', 'name'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface SearchQuery {
  /** Words matched against name, title, description, and id. All must match. */
  query?: string;
  /** Exact theme id. */
  theme?: string;
  /** Any of these theme ids. */
  themes?: readonly string[];
  /** `official` (default): official fiches seen in several directories first. `name`: alphabetical. */
  sort?: SortOrder;
  /** When true, keep only official fiches. */
  official?: boolean;
  /** When true, keep only fiches with a package or a remote: something to install. */
  installable?: boolean;
  /**
   * Accepted so callers can pass `--all`. Ignored until a popularity signal exists.
   * Sorting does not change.
   */
  all?: boolean;
}

/**
 * Filters a snapshot. Official fiches seen in more than one directory come first,
 * then `id`. `all` is accepted and ignored: nothing records popularity yet.
 */
export function searchCatalog(catalog: Catalog, query: SearchQuery = {}): Server[] {
  return searchServers(catalog.servers, query);
}

/** Same filters and order as {@link searchCatalog}, over any list of fiches. */
export function searchServers(servers: readonly Server[], query: SearchQuery = {}): Server[] {
  // `all` is accepted and ignored until a popularity signal exists.
  void query.all;
  const tokens = (query.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== '');
  return sorted(servers, query.sort ?? 'official')
    .filter((server) => {
      if (query.official === true && !server.official) return false;
      if (query.installable === true && !hasCommand(server)) return false;
      if (query.theme !== undefined && !server.themes.includes(query.theme)) return false;
      if (query.themes?.length && !query.themes.some((theme) => server.themes.includes(theme))) return false;
      if (tokens.length === 0) return true;
      const text = haystack(server);
      return tokens.every((token) => text.includes(token));
    });
}

/**
 * The list in one order, sorted once per list and order: filtering keeps that order, so a search
 * or a toggle no longer sorts 150,000 fiches again.
 */
const sortedLists = new WeakMap<readonly Server[], Map<SortOrder, Server[]>>();
function sorted(servers: readonly Server[], order: SortOrder): Server[] {
  let byOrder = sortedLists.get(servers);
  if (!byOrder) sortedLists.set(servers, (byOrder = new Map()));
  let list = byOrder.get(order);
  if (!list) {
    list = [...servers].sort((a, b) => (order === 'name' ? compare(label(a), label(b)) : rank(a) - rank(b)) || compare(a.id, b.id));
    byOrder.set(order, list);
  }
  return list;
}

/** Same order as `localeCompare`, without building a collator on every call: it matters over 150,000 fiches. */
const compare = new Intl.Collator().compare;

/** Lower-cased search text of a fiche, built once per fiche. */
const haystacks = new WeakMap<Server, string>();
function haystack(server: Server): string {
  let text = haystacks.get(server);
  if (text === undefined) haystacks.set(server, (text = [server.name, server.title ?? '', server.description ?? '', server.id].join('\n').toLowerCase()));
  return text;
}

/** Whether the fiche has a package or a remote to install, checked once per fiche. */
const commands = new WeakMap<Server, boolean>();
export function hasCommand(server: Server): boolean {
  let found = commands.get(server);
  if (found === undefined) {
    try {
      proposeCommand(server);
      found = true;
    } catch {
      found = false;
    }
    commands.set(server, found);
  }
  return found;
}

function label(server: Server): string {
  return (server.title || server.name).toLowerCase();
}

/** Official and present in several directories, then everyone else. */
function rank(server: Server): number {
  return server.official && server.origins.length > 1 ? 0 : 1;
}
