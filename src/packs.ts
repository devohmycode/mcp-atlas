import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { configPath } from './config.js';
import type { Catalog } from './types.js';

/** A set of servers for one kind of work, installed as a block. */
export interface Pack {
  id: string;
  name: string;
  description: string;
  servers: string[];
}

const packsSchema = z.array(
  z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().min(1),
    servers: z.array(z.string().min(1)).min(1).max(100),
  }),
);

/** `~/.config/mcp-atlas/packs.json`, beside the user config. */
export function userPacksPath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  return join(dirname(configPath(env, home)), 'packs.json');
}

export function bundledPacksPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, 'data', 'packs.json');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return join(process.cwd(), 'data', 'packs.json');
}

function readFile(path: string): Pack[] {
  if (!existsSync(path)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${path} is not JSON`);
  }
  const parsed = packsSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${path} is not a pack list: ${parsed.error.issues[0]?.message ?? ''}`);
  return parsed.data;
}

/** Bundled packs, then the user's; a user pack with a bundled id replaces it. */
export function readPacks(paths: { user?: string; bundled?: string } = {}): Pack[] {
  const byId = new Map<string, Pack>();
  for (const pack of [...readFile(paths.bundled ?? bundledPacksPath()), ...readFile(paths.user ?? userPacksPath())]) byId.set(pack.id, pack);
  return [...byId.values()];
}

/** How much of a pack this snapshot holds. */
export function packStatus(pack: Pack, catalog: Catalog): { available: number; total: number; missing: string[] } {
  const known = new Set(catalog.servers.map((server) => server.id));
  const ids = [...new Set(pack.servers)];
  const missing = ids.filter((id) => !known.has(id));
  return { available: ids.length - missing.length, total: ids.length, missing };
}

/** Theme id of a pack in the tree. */
export const packTheme = (id: string) => `pack:${id}`;

/** Adds one theme per pack, holding the pack's servers that the catalog has. */
export function applyPacks(catalog: Catalog, packs: readonly Pack[]): Catalog {
  const live = packs.filter((pack) => packStatus(pack, catalog).available > 0);
  if (!live.length) return catalog;
  const extra = new Map<string, string[]>();
  for (const pack of live) for (const id of pack.servers) extra.set(id, [...(extra.get(id) ?? []), packTheme(pack.id)]);
  return {
    ...catalog,
    themes: [...live.map((pack) => ({ id: packTheme(pack.id), label: `📦 ${pack.name}`, description: pack.description })), ...catalog.themes],
    servers: catalog.servers.map((server) => (extra.has(server.id) ? { ...server, themes: [...extra.get(server.id)!, ...server.themes] } : server)),
  };
}
