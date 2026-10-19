import { classify } from './classify.js';
import { dedupe } from './dedupe.js';
import { markOfficial } from './mark.js';
import type { Source } from './source.js';
import { THEMES } from './taxonomy.js';
import type { Catalog, CatalogStats, RawServer } from './types.js';

export class CatalogError extends Error {
  readonly name = 'CatalogError';
  constructor(message: string) {
    super(message);
  }
}

export interface BuildOptions {
  /** The upstreams to read. One failed source is skipped; every source failing aborts. */
  sources: readonly Source[];
  /** Overrides the snapshot clock. */
  generatedAt?: string;
}

/**
 * Reads the given sources, dedupes, marks official fiches, classifies, and
 * counts. Nothing is executed. The official registry by itself is enough.
 */
export async function buildCatalog(opts: BuildOptions): Promise<Catalog> {
  const settled = await Promise.allSettled(opts.sources.map((source) => source.fetch()));
  if (settled.every((result) => result.status === 'rejected')) {
    const detail = opts.sources
      .map((source, i) => `${source.origin}: ${errorText(settled[i]?.status === 'rejected' ? settled[i].reason : undefined)}`)
      .join('; ');
    throw new CatalogError(detail ? `Every catalog source failed: ${detail}` : 'Every catalog source failed');
  }

  const raw: RawServer[] = [];
  const stats = emptyStats();
  opts.sources.forEach((source, i) => {
    const result = settled[i];
    const previous = stats.raw[source.origin] ?? 0;
    if (result?.status === 'fulfilled') {
      raw.push(...result.value);
      const count = previous + result.value.length;
      stats.raw[source.origin] = count;
      stats.sources[source.origin] = { status: 'ok', count };
      return;
    }
    stats.raw[source.origin] = previous;
    if (previous === 0) {
      stats.sources[source.origin] = { status: 'error', count: 0, error: `${source.origin}: ${errorText(result?.reason)}` };
    }
  });

  const servers = markOfficial(dedupe(raw), raw);
  for (const server of servers) server.themes = classify(server);
  stats.merged = servers.length;
  for (const server of servers) {
    if (server.official) stats.official += 1;
    if (server.singleRegistry) stats.singleRegistry += 1;
    for (const theme of server.themes) stats.byTheme[theme] = (stats.byTheme[theme] ?? 0) + 1;
  }

  return {
    version: 1,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    themes: [...THEMES],
    servers,
    stats,
  };
}

function emptyStats(): CatalogStats {
  const byTheme: Record<string, number> = {};
  for (const theme of THEMES) byTheme[theme.id] = 0;
  return { raw: {}, sources: {}, merged: 0, official: 0, singleRegistry: 0, byTheme };
}

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 300);
}
