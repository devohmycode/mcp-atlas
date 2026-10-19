import { asArray, asRecord, ContractError, optionalString, requiredString } from '../contract.js';
import { fetchJsonPages, type FetchOptions } from '../http.js';
import type { Source } from '../source.js';
import type { PackageRef, RawServer, RemoteRef, Transport } from '../types.js';

const SOURCE = 'glama';
const ORIGIN = 'https://glama.ai';

export interface GlamaPage {
  servers: RawServer[];
  nextCursor?: string;
}

export function glamaUrl(after?: string): string {
  const url = new URL('/api/mcp/v1/servers', ORIGIN);
  url.searchParams.set('first', '100');
  if (after) url.searchParams.set('after', after);
  return url.toString();
}

export function glamaSource(opts: FetchOptions = {}): Source {
  return {
    origin: 'glama',
    fetch: () =>
      fetchJsonPages(
        glamaUrl(),
        (body) => {
          const page = parseGlamaPage(body);
          return { items: page.servers, nextUrl: page.nextCursor ? glamaUrl(page.nextCursor) : undefined };
        },
        opts,
      ),
  };
}

/** Contract: `servers[]` plus `pageInfo.hasNextPage` and, when that is true, `pageInfo.endCursor`. */
export function parseGlamaPage(body: unknown): GlamaPage {
  const root = asRecord(body, SOURCE, 'page');
  const servers = asArray(root.servers, SOURCE, 'servers').map((entry, i) => parseServer(entry, i));
  const pageInfo = asRecord(root.pageInfo, SOURCE, 'pageInfo');
  if (typeof pageInfo.hasNextPage !== 'boolean') throw new ContractError(SOURCE, 'pageInfo.hasNextPage manque');
  const endCursor = optionalString(pageInfo.endCursor, SOURCE, 'pageInfo.endCursor');
  if (pageInfo.hasNextPage && !endCursor) throw new ContractError(SOURCE, 'pageInfo.endCursor manque');
  return { servers, nextCursor: pageInfo.hasNextPage ? endCursor : undefined };
}

function parseServer(entry: unknown, index: number): RawServer {
  const server = asRecord(entry, SOURCE, `servers[${index}]`);
  return {
    origin: 'glama',
    name: requiredString(server.name, SOURCE, `servers[${index}].name`),
    description: optionalString(server.description, SOURCE, `servers[${index}].description`),
    repository: parseRepository(server.repository, index),
    packages: server.packages === undefined ? [] : parsePackages(server.packages, index),
    remotes: server.remotes === undefined ? [] : parseRemotes(server.remotes, index),
  };
}

function parseRepository(value: unknown, index: number): RawServer['repository'] {
  if (value === undefined || value === null) return undefined;
  const repo = asRecord(value, SOURCE, `servers[${index}].repository`);
  const url = optionalString(repo.url, SOURCE, `servers[${index}].repository.url`);
  return url ? { url } : undefined;
}

function parsePackages(value: unknown, index: number): PackageRef[] {
  return asArray(value, SOURCE, `servers[${index}].packages`).map((item, j) => {
    const pkg = asRecord(item, SOURCE, `servers[${index}].packages[${j}]`);
    const transport = asRecord(pkg.transport, SOURCE, `servers[${index}].packages[${j}].transport`);
    return {
      registryType: requiredString(pkg.registryType, SOURCE, `servers[${index}].packages[${j}].registryType`),
      identifier: requiredString(pkg.identifier, SOURCE, `servers[${index}].packages[${j}].identifier`),
      version: optionalString(pkg.version, SOURCE, `servers[${index}].packages[${j}].version`),
      transport: transportOf(transport.type, `servers[${index}].packages[${j}].transport.type`),
    };
  });
}

function parseRemotes(value: unknown, index: number): RemoteRef[] {
  return asArray(value, SOURCE, `servers[${index}].remotes`).map((item, j) => {
    const remote = asRecord(item, SOURCE, `servers[${index}].remotes[${j}]`);
    const type = transportOf(remote.type, `servers[${index}].remotes[${j}].type`);
    if (type === 'stdio') throw new ContractError(SOURCE, `servers[${index}].remotes[${j}].type ne peut pas être stdio`);
    return { type, url: requiredString(remote.url, SOURCE, `servers[${index}].remotes[${j}].url`) };
  });
}

function transportOf(value: unknown, where: string): Transport {
  if (value === 'stdio' || value === 'sse' || value === 'streamable-http') return value;
  throw new ContractError(SOURCE, `${where} n'est pas un transport connu`);
}
