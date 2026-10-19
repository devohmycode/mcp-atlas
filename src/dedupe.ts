import { chooseId, isReverseDns } from './id.js';
import { ORIGINS, type PackageRef, type RawServer, type RemoteRef, type Server } from './types.js';

/**
 * One server per canonical id. Origins are united, the longest description wins,
 * and the official registry's version wins when that source has one.
 * Packages and remotes are united without duplicates.
 */
export function dedupe(raw: RawServer[]): Server[] {
  const byId = new Map<string, Server>();
  const officialVersion = new Set<string>();
  for (const entry of raw) {
    let id: string;
    try {
      id = chooseId({ name: entry.name, repositoryUrl: entry.repository?.url });
    } catch {
      continue;
    }
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, fresh(id, entry));
      if (entry.origin === 'official' && entry.version) officialVersion.add(id);
      continue;
    }
    merge(existing, entry, officialVersion.has(id));
    if (entry.origin === 'official' && entry.version) officialVersion.add(id);
  }
  for (const server of byId.values()) {
    server.origins = ORIGINS.filter((origin) => server.origins.includes(origin));
    server.singleRegistry = server.origins.length === 1;
  }
  return [...byId.values()];
}

function fresh(id: string, entry: RawServer): Server {
  return {
    id,
    name: entry.name && isReverseDns(entry.name) ? entry.name : (entry.name ?? id),
    title: entry.title,
    description: entry.description,
    version: entry.version,
    repository: entry.repository,
    packages: [...(entry.packages ?? [])],
    remotes: [...(entry.remotes ?? [])],
    origins: [entry.origin],
    themes: [],
    official: false,
    singleRegistry: true,
  };
}

function merge(server: Server, entry: RawServer, hasOfficialVersion: boolean): void {
  if (!server.origins.includes(entry.origin)) server.origins.push(entry.origin);
  if (entry.name && isReverseDns(entry.name)) server.name = entry.name;
  server.title = longer(server.title, entry.title);
  server.description = longer(server.description, entry.description);
  if (entry.origin === 'official' && entry.version) server.version = entry.version;
  else if (!hasOfficialVersion && entry.version && !server.version) server.version = entry.version;
  if (entry.origin === 'official' && entry.repository) server.repository = entry.repository;
  else server.repository ??= entry.repository;
  server.packages = unite(server.packages, entry.packages ?? [], packageKey);
  server.remotes = unite(server.remotes, entry.remotes ?? [], remoteKey);
}

function longer(current: string | undefined, next: string | undefined): string | undefined {
  if (!next) return current;
  if (!current || next.length > current.length) return next;
  return current;
}

function unite<T>(current: T[], extra: T[], key: (item: T) => string): T[] {
  const seen = new Set(current.map(key));
  const out = [...current];
  for (const item of extra) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function packageKey(pkg: PackageRef): string {
  return `${pkg.registryType}\0${pkg.identifier}\0${pkg.version ?? ''}\0${pkg.transport}`;
}

function remoteKey(remote: RemoteRef): string {
  return `${remote.type}\0${remote.url}`;
}
