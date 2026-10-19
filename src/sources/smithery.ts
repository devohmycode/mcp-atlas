import { asArray, asRecord, ContractError, optionalString, requiredString } from '../contract.js';
import { fetchJsonPages, type FetchOptions } from '../http.js';
import type { Source } from '../source.js';
import type { RawServer } from '../types.js';

const SOURCE = 'smithery';
const ORIGIN = 'https://registry.smithery.ai';

export interface SmitheryPage {
  servers: RawServer[];
  totalPages: number;
}

export function smitheryUrl(page: number): string {
  const url = new URL('/servers', ORIGIN);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', '100');
  // Without `seed` the API ranks at most 500 results (its `topK` cap); a seed gives a stable order over all servers.
  url.searchParams.set('seed', '1');
  return url.toString();
}

/** Honours `totalPages`; keeps the first entry per `qualifiedName` in case the listing shifts mid-crawl. */
export function smitherySource(opts: FetchOptions = {}): Source {
  return {
    origin: 'smithery',
    async fetch() {
      let page = 1;
      const servers = await fetchJsonPages(
        smitheryUrl(page),
        (body) => {
          const parsed = parseSmitheryPage(body);
          page += 1;
          return { items: parsed.servers, nextUrl: page <= parsed.totalPages ? smitheryUrl(page) : undefined };
        },
        opts,
      );
      const seen = new Set<string | undefined>();
      return servers.filter((server) => !seen.has(server.name) && seen.add(server.name));
    },
  };
}

/**
 * Contract: the list at `registry.smithery.ai/servers`.
 * `qualifiedName` is required. `deploymentUrl`, when present, is a remote.
 */
export function parseSmitheryPage(body: unknown): SmitheryPage {
  const root = asRecord(body, SOURCE, 'page');
  const servers = asArray(root.servers, SOURCE, 'servers').map((entry, i) => parseServer(entry, i));
  const pagination = asRecord(root.pagination, SOURCE, 'pagination');
  const totalPages = pagination.totalPages;
  if (typeof totalPages !== 'number' || !Number.isInteger(totalPages) || totalPages < 1) {
    throw new ContractError(SOURCE, 'pagination.totalPages manque');
  }
  return { servers, totalPages };
}

function parseServer(entry: unknown, index: number): RawServer {
  const server = asRecord(entry, SOURCE, `servers[${index}]`);
  const homepage = optionalString(server.homepage, SOURCE, `servers[${index}].homepage`);
  const deploymentUrl = optionalString(server.deploymentUrl, SOURCE, `servers[${index}].deploymentUrl`);
  return {
    origin: 'smithery',
    name: requiredString(server.qualifiedName, SOURCE, `servers[${index}].qualifiedName`),
    title: optionalString(server.displayName, SOURCE, `servers[${index}].displayName`),
    description: optionalString(server.description, SOURCE, `servers[${index}].description`),
    repository: homepage ? { url: homepage } : undefined,
    remotes: deploymentUrl ? [{ type: 'streamable-http', url: deploymentUrl }] : [],
  };
}
