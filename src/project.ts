import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { catalogPin } from './outdated.js';
import { CLIENT_IDS, type Catalog, type Server } from './types.js';

/** The servers a project expects, at its root, versioned with its code. */
export const PROJECT_FILE = 'mcp-atlas.json';

const projectSchema = z.object({
  servers: z.array(z.string().min(1)),
  agents: z.array(z.enum(CLIENT_IDS)).optional(),
  /** Pins written by `lock`: `sync` installs exactly these versions. */
  versions: z.record(z.string(), z.string().min(1)).optional(),
});

export type ProjectFile = z.infer<typeof projectSchema>;

export function parseProjectFile(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not JSON');
  }
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`).join('; '));
  return parsed.data;
}

export function readProjectFile(path = PROJECT_FILE): ProjectFile {
  return parseProjectFile(readFileSync(path, 'utf8'));
}

export interface LockChange {
  id: string;
  previous?: string;
  version: string;
}

/** Pins every listed server to the version the catalog installs now. An unknown id stops before any write. */
export function lockProject(path: string, catalog: Catalog, dryRun: boolean): LockChange[] {
  const file = readProjectFile(path);
  const byId = new Map(catalog.servers.map((server) => [server.id, server]));
  const versions = { ...file.versions };
  const changes: LockChange[] = [];
  for (const id of file.servers) {
    const server = byId.get(id);
    if (!server) throw new Error(`Unknown server ${id}`);
    const version = catalogPin(server);
    if (!version || versions[id] === version) continue;
    changes.push({ id, previous: versions[id], version });
    versions[id] = version;
  }
  if (changes.length && !dryRun) writeFileSync(path, `${JSON.stringify({ ...file, versions }, null, 2)}\n`);
  return changes;
}

/** The same server, pinned to `version` wherever the command takes its version from. */
export function pinned(server: Server, version: string): Server {
  return { ...server, version, packages: server.packages.map((pkg) => ({ ...pkg, version })) };
}

/** A catalog whose listed servers carry the project's pins. */
export function withPins(catalog: Catalog, versions: Record<string, string> = {}): Catalog {
  return { ...catalog, servers: catalog.servers.map((server) => (versions[server.id] ? pinned(server, versions[server.id]!) : server)) };
}
