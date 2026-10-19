import { applyPlan, type ApplyResult } from './apply.js';
import { IdError, parseId } from './id.js';
import { planInstall } from './plan.js';
import type { PathContext } from './clients.js';
import type { Catalog, ClientId, Scope, Server } from './types.js';
import type { InstalledResult } from './installed.js';

export class BundleError extends Error {
  readonly name = 'BundleError';
  constructor(message: string) {
    super(message);
  }
}

/** Ids that were matched to a catalog fiche. Unknown config keys are left out. */
export interface Bundle {
  mcpAtlas: 1;
  servers: string[];
}

export function exportBundle(installed: InstalledResult): Bundle {
  return { mcpAtlas: 1, servers: [...new Set(installed.matches.map((match) => match.id))] };
}

/**
 * Checks the document and every id before the caller writes anything.
 * An id that is empty, spaced, or shaped like an option (`-y`) is rejected.
 */
export function parseBundle(text: string): Bundle {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new BundleError('Import is not JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BundleError('Import is not a bundle');
  const record = value as { mcpAtlas?: unknown; servers?: unknown };
  if (record.mcpAtlas !== 1) throw new BundleError('Import must be mcpAtlas version 1');
  if (!Array.isArray(record.servers) || record.servers.some((id) => typeof id !== 'string')) {
    throw new BundleError('Import servers must be a list of ids');
  }
  const servers = record.servers as string[];
  for (const id of servers) {
    try {
      parseId(id);
    } catch (err) {
      const message = err instanceof IdError || err instanceof Error ? err.message : `Unusable id ${id}`;
      throw new BundleError(message);
    }
  }
  return { mcpAtlas: 1, servers };
}

export interface ImportInput {
  text: string;
  catalog: Catalog;
  clients: readonly ClientId[];
  scope: Scope;
  ctx: PathContext;
  files?: ReadonlyMap<string, string>;
  dryRun?: boolean;
  config?: { audit?: boolean };
  enabled?: boolean;
  log?: (line: string) => void;
}

/**
 * Validates every id, then installs through the same plan as a normal install.
 * A bad id throws before any file is written.
 */
export async function importBundle(input: ImportInput): Promise<ApplyResult[]> {
  const bundle = parseBundle(input.text);
  const servers: Server[] = [];
  for (const id of [...new Set(bundle.servers)]) {
    const server = input.catalog.servers.find((item) => item.id === id);
    if (!server) throw new BundleError(`Unknown server ${id}`);
    servers.push(server);
  }
  const plans = servers.flatMap((server) =>
    planInstall({
      server,
      clients: input.clients,
      scope: input.scope,
      ctx: input.ctx,
      files: input.files,
      config: input.config,
      enabled: input.enabled,
    }),
  );
  const results: ApplyResult[] = [];
  for (const plan of plans) {
    results.push(await applyPlan(plan, { dryRun: input.dryRun, log: input.log }));
  }
  return results;
}
