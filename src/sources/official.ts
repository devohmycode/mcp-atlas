import { fetchJsonPages, type FetchOptions } from '../http.js';
import { parseId } from '../id.js';
import type { Source } from '../source.js';
import type { Origin, PackageRef, RawServer, RemoteRef, Transport } from '../types.js';

const REGISTRY_ORIGIN = 'https://registry.modelcontextprotocol.io';
export const OFFICIAL_PAGE_LIMIT = 100;

export class RegistryContractError extends Error {
  readonly name = 'RegistryContractError';
  constructor(message: string) {
    super(message);
  }
}

export interface OfficialPage {
  servers: RawServer[];
  nextCursor?: string;
}

/** `limit` is capped at {@link OFFICIAL_PAGE_LIMIT}. `cursor` is the opaque value the registry returned. */
export function officialRegistryUrl(cursor?: string, limit = OFFICIAL_PAGE_LIMIT): string {
  const capped = Math.min(OFFICIAL_PAGE_LIMIT, Math.max(1, limit));
  const url = new URL('/v0.1/servers', REGISTRY_ORIGIN);
  url.searchParams.set('version', 'latest');
  url.searchParams.set('limit', String(capped));
  if (cursor) url.searchParams.set('cursor', cursor);
  return url.toString();
}

export function officialSource(opts: FetchOptions & { limit?: number } = {}): Source {
  const limit = opts.limit ?? OFFICIAL_PAGE_LIMIT;
  return {
    origin: 'official',
    fetch: () =>
      fetchJsonPages(
        officialRegistryUrl(undefined, limit),
        (body) => {
          const page = parseOfficialPage(body);
          return {
            items: page.servers,
            nextUrl: page.nextCursor ? officialRegistryUrl(page.nextCursor, limit) : undefined,
          };
        },
        opts,
      ),
  };
}

/** Also reads registries that follow the official spec, such as PulseMCP, under their own `origin`. */
export function parseOfficialPage(body: unknown, origin: Origin = 'official'): OfficialPage {
  const root = record(body, 'page');
  if (!Array.isArray(root.servers)) throw new RegistryContractError('page.servers is not an array');
  const servers: RawServer[] = [];
  for (const entry of root.servers) {
    if (isDeleted(entry)) continue;
    servers.push(parseServer(entry, origin));
  }
  const metadata = root.metadata === undefined ? {} : record(root.metadata, 'metadata');
  const nextCursor = metadata.nextCursor;
  if (nextCursor !== undefined && typeof nextCursor !== 'string') {
    throw new RegistryContractError('metadata.nextCursor is not a string');
  }
  return { servers, nextCursor: nextCursor || undefined };
}

function parseServer(entry: unknown, origin: Origin): RawServer {
  const wrapper = record(entry, 'server entry');
  const server = record(wrapper.server, 'server');
  const name = stringField(server.name, 'server.name');
  if (origin === 'official' && parseId(name).kind !== 'registry') {
    throw new RegistryContractError(`server.name is not a registry id: ${name}`);
  }
  const packages = server.packages === undefined ? [] : parsePackages(server.packages);
  const remotes = server.remotes === undefined ? [] : parseRemotes(server.remotes);
  return {
    origin,
    name,
    title: optionalString(server.title, 'server.title'),
    description: optionalString(server.description, 'server.description'),
    version: optionalString(server.version, 'server.version'),
    repository: parseRepository(server.repository),
    packages,
    remotes,
    status: readStatus(entry),
  };
}

function parseRepository(value: unknown): RawServer['repository'] {
  if (value === undefined) return undefined;
  const repo = record(value, 'server.repository');
  const url = optionalString(repo.url, 'server.repository.url');
  return url ? { url } : undefined;
}

function parsePackages(value: unknown): PackageRef[] {
  if (!Array.isArray(value)) throw new RegistryContractError('server.packages is not an array');
  return value.map((item, i) => {
    const pkg = record(item, `server.packages[${i}]`);
    const transport = record(pkg.transport, `server.packages[${i}].transport`);
    return {
      registryType: stringField(pkg.registryType, `server.packages[${i}].registryType`),
      identifier: stringField(pkg.identifier, `server.packages[${i}].identifier`),
      version: optionalString(pkg.version, `server.packages[${i}].version`),
      transport: transportType(transport.type, `server.packages[${i}].transport.type`),
    };
  });
}

function parseRemotes(value: unknown): RemoteRef[] {
  if (!Array.isArray(value)) throw new RegistryContractError('server.remotes is not an array');
  return value.map((item, i) => {
    const remote = record(item, `server.remotes[${i}]`);
    const type = transportType(remote.type, `server.remotes[${i}].type`);
    if (type === 'stdio') throw new RegistryContractError(`server.remotes[${i}].type cannot be stdio`);
    return { type, url: stringField(remote.url, `server.remotes[${i}].url`) };
  });
}

function transportType(value: unknown, where: string): Transport {
  if (value === 'stdio' || value === 'sse' || value === 'streamable-http') return value;
  throw new RegistryContractError(`${where} is not a known transport`);
}

/** Absent status is the registry's current record, so it counts as active. */
function readStatus(entry: unknown): string {
  const wrapper = asRecord(entry);
  const server = asRecord(wrapper?.server);
  if (typeof server?.status === 'string' && server.status !== '') return server.status;
  const meta = asRecord(wrapper?._meta);
  const official = asRecord(meta?.['io.modelcontextprotocol.registry/official']);
  if (typeof official?.status === 'string' && official.status !== '') return official.status;
  return 'active';
}

function isDeleted(entry: unknown): boolean {
  const wrapper = asRecord(entry);
  const server = asRecord(wrapper?.server);
  if (server?.status === 'deleted') return true;
  const meta = asRecord(wrapper?._meta);
  const official = asRecord(meta?.['io.modelcontextprotocol.registry/official']);
  return official?.status === 'deleted';
}

function record(value: unknown, where: string): Record<string, unknown> {
  const found = asRecord(value);
  if (!found) throw new RegistryContractError(`${where} is not an object`);
  return found;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringField(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '') throw new RegistryContractError(`${where} is missing`);
  return value;
}

function optionalString(value: unknown, where: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new RegistryContractError(`${where} is not a string`);
  return value || undefined;
}
