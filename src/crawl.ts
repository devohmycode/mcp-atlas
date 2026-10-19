import { pathToFileURL } from 'node:url';
import { buildCatalog } from './build.js';
import { defaultCatalogPath, saveCatalog } from './catalog.js';
import type { Source } from './source.js';
import { glamaSource } from './sources/glama.js';
import { officialSource } from './sources/official.js';
import { pulseSource } from './sources/pulsemcp.js';
import { smitherySource } from './sources/smithery.js';
import type { Catalog } from './types.js';

export class CrawlError extends Error {
  readonly name = 'CrawlError';
  constructor(message: string) {
    super(message);
  }
}

export interface CrawlOptions {
  /** Defaults to the five public registries. Tests inject their own. */
  sources?: readonly Source[];
  /** Defaults to `data/catalog.json.gz`. */
  out?: string;
  log?: (line: string) => void;
}

/**
 * Builds a snapshot, prints one count per origin, then `merged` and `official fiches`.
 * Zero official fiches, or an official source error, throws before the file is written.
 * An empty or failed other source is only printed.
 */
export async function crawl(opts: CrawlOptions = {}): Promise<Catalog> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const sources = opts.sources ?? defaultSources(process.env, log);
  const catalog = await buildCatalog({ sources });
  for (const source of sources) {
    const report = catalog.stats.sources[source.origin];
    if (report?.status === 'error') log(report.error ?? `${source.origin}: error`);
    else log(`${source.origin}: ${report?.count ?? 0}`);
  }
  log(`merged: ${catalog.stats.merged}`);
  log(`official fiches: ${catalog.stats.official}`);
  const official = catalog.stats.sources.official;
  const officialCount = catalog.stats.raw.official ?? 0;
  if (official?.status === 'error' || officialCount === 0) {
    throw new CrawlError('Official registry returned zero fiches');
  }
  await saveCatalog(catalog, opts.out ?? defaultCatalogPath());
  return catalog;
}

/**
 * Glama needs `GLAMA_API_KEY`, PulseMCP `PULSEMCP_API_KEY` and `PULSEMCP_TENANT_ID`;
 * without them the source is logged as skipped. Page progress goes to `progress` (stderr).
 * mcp.so has no source: `/api/servers` answers 404 since October 2026, and its sitemap lists slugs without repositories.
 */
export function defaultSources(
  env: Record<string, string | undefined>,
  log: (line: string) => void,
  progress: (line: string) => void = (line) => console.error(line),
): Source[] {
  // The official registry often takes 10-30 s per page; 30 s drops the whole source.
  const sources = [officialSource({ timeoutMs: 120_000, progress }), smitherySource({ progress })];
  if (env.GLAMA_API_KEY) sources.push(glamaSource({ progress, headers: { authorization: `Bearer ${env.GLAMA_API_KEY}` } }));
  else log('glama: skipped (set GLAMA_API_KEY)');
  if (env.PULSEMCP_API_KEY && env.PULSEMCP_TENANT_ID) {
    sources.push(
      pulseSource({ progress, headers: { 'x-api-key': env.PULSEMCP_API_KEY, 'x-tenant-id': env.PULSEMCP_TENANT_ID } }),
    );
  } else log('pulsemcp: skipped (set PULSEMCP_API_KEY and PULSEMCP_TENANT_ID)');
  return sources;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // API keys from `.env` when it exists; a variable already set (CI secrets, shell) wins over the file.
  try {
    process.loadEnvFile();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  crawl().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
