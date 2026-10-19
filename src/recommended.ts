import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { configPath } from './config.js';
import type { Catalog, Server } from './types.js';

export interface Recommendation {
  id: string;
  reason?: string;
}

const fileSchema = z.object({
  servers: z.array(
    z.object({
      id: z.string().min(1),
      reason: z.string().optional(),
    }),
  ),
});

export const RECOMMENDED_THEME = {
  id: 'recommended',
  label: 'Recommended',
  description: 'Servers picked for this machine.',
};

/** `~/.config/mcp-atlas/recommended.json`, beside the user config. */
export function userRecommendedPath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  return join(dirname(configPath(env, home)), 'recommended.json');
}

export function bundledRecommendedPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, 'data', 'recommended.json');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return join(process.cwd(), 'data', 'recommended.json');
}

export interface RecommendedSources {
  /** When this file exists, it replaces the bundled list entirely. */
  userPath?: string;
  bundledPath?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

/**
 * The user file replaces the bundled list, including when it is empty.
 * A missing user file falls back to `data/recommended.json`.
 */
export function readRecommended(sources: RecommendedSources = {}): Recommendation[] {
  const user = sources.userPath ?? userRecommendedPath(sources.env, sources.home);
  if (existsSync(user)) return parseRecommended(readFileSync(user, 'utf8'), user);
  const bundled = sources.bundledPath ?? bundledRecommendedPath();
  if (!existsSync(bundled)) return [];
  return parseRecommended(readFileSync(bundled, 'utf8'), bundled);
}

export function parseRecommended(text: string, path: string): Recommendation[] {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path} is not JSON`);
  }
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${path} is not a recommendation list`);
  return parsed.data.servers;
}

/**
 * Adds a Recommended section for ids that exist. An id that is not in the
 * catalog is returned in `missing` and does not create a fiche.
 */
export function applyRecommended(catalog: Catalog, picks: readonly Recommendation[]): { catalog: Catalog; missing: string[] } {
  const byId = new Map(catalog.servers.map((server) => [server.id, server]));
  const missing: string[] = [];
  let matched = 0;
  for (const pick of picks) {
    const server = byId.get(pick.id);
    if (!server) {
      missing.push(pick.id);
      continue;
    }
    if (!server.themes.includes(RECOMMENDED_THEME.id)) {
      byId.set(pick.id, { ...server, themes: [RECOMMENDED_THEME.id, ...server.themes] });
    }
    matched += 1;
  }
  if (matched === 0) return { catalog, missing };
  const themes = catalog.themes.some((theme) => theme.id === RECOMMENDED_THEME.id)
    ? catalog.themes
    : [RECOMMENDED_THEME, ...catalog.themes];
  const servers = catalog.servers.map((server) => byId.get(server.id) ?? server);
  return {
    missing,
    catalog: {
      ...catalog,
      themes,
      servers,
      stats: { ...catalog.stats, byTheme: { ...catalog.stats.byTheme, recommended: matched } },
    },
  };
}

export function recommend(catalog: Catalog, sources: RecommendedSources = {}): { catalog: Catalog; missing: string[] } {
  return applyRecommended(catalog, readRecommended(sources));
}

export type { Server };
