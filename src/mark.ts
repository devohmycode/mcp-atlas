import { chooseId, githubFromUrl } from './id.js';
import type { RawServer, Server } from './types.js';
import { VENDOR_REPOS } from './vendors.js';

const VENDORS = new Set(VENDOR_REPOS.map((repo) => repo.toLowerCase()));

/**
 * Sets `official` on each fiche. True when an official-registry record for
 * that id is active, or when the repository is on the vendor list.
 */
export function markOfficial(servers: Server[], raw: RawServer[]): Server[] {
  const active = activeOfficialIds(raw);
  for (const server of servers) {
    server.official = active.has(server.id) || isVendorRepository(server.repository?.url);
  }
  return servers;
}

function activeOfficialIds(raw: RawServer[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of raw) {
    if (entry.origin !== 'official') continue;
    if ((entry.status ?? 'active') !== 'active') continue;
    try {
      ids.add(chooseId({ name: entry.name, repositoryUrl: entry.repository?.url }));
    } catch {
      continue;
    }
  }
  return ids;
}

function isVendorRepository(url: string | undefined): boolean {
  if (!url) return false;
  const github = githubFromUrl(url);
  if (!github) return false;
  return VENDORS.has(`${github.owner}/${github.repo}`.toLowerCase());
}
