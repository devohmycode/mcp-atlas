import { existsSync, readFileSync } from 'node:fs';
import { applyPlan, applyRemoval, type ApplyResult } from './apply.js';
import { auditEnabled, auditServer, failsAudit } from './audit.js';
import { CLIENTS, clientConfigPath, clientSpec, type PathContext } from './clients.js';
import { parseId } from './id.js';
import { readInstalled } from './installed.js';
import { PlanError, planInstall } from './plan.js';
import { reviewItems, type ReviewItem } from './review.js';
import type { UserConfig } from './config.js';
import type { Catalog, ClientId, Scope, Server } from './types.js';

export interface OperateContext {
  home: string;
  cwd: string;
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  config?: UserConfig;
}

export function operateContext(ctx: OperateContext): PathContext {
  return { platform: ctx.platform, home: ctx.home, env: ctx.env, projectRoot: ctx.cwd };
}

/** Clients for a scope. An empty request means every client that has that scope. */
export function clientsForScope(scope: Scope, requested: readonly string[]): ClientId[] {
  const allowed = CLIENTS.filter((spec) => spec.scopes.includes(scope));
  if (requested.length === 0) return allowed.map((spec) => spec.id);
  const known = new Map(allowed.map((spec) => [spec.id, spec]));
  const ids: ClientId[] = [];
  for (const name of requested) {
    for (const part of name.split(',')) {
      const id = part.trim();
      if (id === '') continue;
      const spec = known.get(id as ClientId);
      if (!spec) {
        if (CLIENTS.some((item) => item.id === id)) throw new PlanError(`${id} has no ${scope} config`);
        throw new PlanError(`Unknown client ${id}`);
      }
      if (!ids.includes(spec.id)) ids.push(spec.id);
    }
  }
  return ids;
}

export function readClientFiles(clients: readonly ClientId[], scope: Scope, ctx: OperateContext): Map<string, string> {
  const files = new Map<string, string>();
  const paths = operateContext(ctx);
  for (const id of clients) {
    const path = clientConfigPath(id, scope, paths);
    if (files.has(path) || !existsSync(path)) continue;
    files.set(path, readFileSync(path, 'utf8'));
  }
  return files;
}

export interface HighRisk {
  id: string;
  detail: string;
}

export function highRiskOf(server: Pick<Server, 'id' | 'version' | 'packages' | 'remotes' | 'repository'>): HighRisk | undefined {
  const result = auditServer(server);
  if (!failsAudit(result)) return undefined;
  const detail = result.risks
    .filter((risk) => risk.level === 'high')
    .map((risk) => risk.detail)
    .join('; ');
  return { id: server.id, detail: detail || 'high risk' };
}

export interface InstallRequest {
  catalog: Catalog;
  ids: readonly string[];
  clients: readonly ClientId[];
  scope: Scope;
  ctx: OperateContext;
  /** Write. Without this and without `dryRun`, only the review is returned. */
  yes?: boolean;
  dryRun?: boolean;
  /** `false` is `--no-audit`. */
  enabled?: boolean;
  /** Explicit acceptance (web `acceptRisk`, MCP `accept_risk`, a checked tree row). */
  acceptHighRisk?: boolean;
  /** `skip` names a high risk and continues. `refuse` throws before any write. */
  policy: 'skip' | 'refuse';
  log?: (line: string) => void;
}

export interface InstallOutcome {
  review: ReviewItem[];
  results: ApplyResult[];
  excluded: HighRisk[];
  written: boolean;
}

/**
 * Resolves every id, then either reviews or writes through the install plan.
 * A high risk is excluded or refused before the first write.
 */
export async function installServers(req: InstallRequest): Promise<InstallOutcome> {
  const unique = [...new Set(req.ids)];
  for (const id of unique) parseId(id);
  const servers: Server[] = [];
  for (const id of unique) {
    const server = req.catalog.servers.find((item) => item.id === id);
    if (!server) throw new PlanError(`Unknown server ${id}`);
    servers.push(server);
  }
  const auditOn = auditEnabled(req.ctx.config ?? {}, req.enabled) && req.acceptHighRisk !== true;
  const excluded: HighRisk[] = [];
  const allowed: Server[] = [];
  for (const server of servers) {
    const risk = auditOn ? highRiskOf(server) : undefined;
    if (risk && req.policy === 'refuse') throw new PlanError(`Audit failed for ${risk.id}: ${risk.detail}`);
    if (risk) excluded.push(risk);
    else allowed.push(server);
  }
  const review = reviewItems(
    req.catalog,
    allowed.map((server) => server.id),
    { clients: req.clients, scope: req.scope },
  );
  if (req.yes !== true && req.dryRun !== true) return { review, results: [], excluded, written: false };
  const files = readClientFiles(req.clients, req.scope, req.ctx);
  const paths = operateContext(req.ctx);
  const results: ApplyResult[] = [];
  for (const server of allowed) {
    const plans = planInstall({
      server,
      clients: req.clients,
      scope: req.scope,
      ctx: paths,
      files,
      config: req.ctx.config,
      enabled: req.acceptHighRisk === true ? false : req.enabled,
    });
    for (const plan of plans) {
      const result = await applyPlan(plan, { dryRun: req.dryRun === true, log: req.log });
      results.push(result);
      if (result.written) files.set(plan.path, readFileSync(plan.path, 'utf8'));
    }
  }
  return { review, results, excluded, written: results.some((result) => result.written) };
}

export interface RemoveRequest {
  catalog: Catalog;
  ids: readonly string[];
  clients: readonly ClientId[];
  scope: Scope;
  ctx: OperateContext;
  yes?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}

/** Removes matched keys. A missing id throws before the first removal. */
export async function removeServers(req: RemoveRequest): Promise<ApplyResult[]> {
  const unique = [...new Set(req.ids)];
  for (const id of unique) parseId(id);
  const found = readInstalled({
    catalog: req.catalog,
    clients: req.clients,
    scope: req.scope,
    ctx: operateContext(req.ctx),
    files: readClientFiles(req.clients, req.scope, req.ctx),
  });
  const missing = unique.filter((id) => !found.matches.some((match) => match.id === id));
  if (missing.length > 0) throw new PlanError(`${missing.join(', ')} is not installed`);
  const dryRun = req.dryRun === true || req.yes !== true;
  const results: ApplyResult[] = [];
  for (const id of unique) {
    for (const match of found.matches.filter((item) => item.id === id)) {
      const format = clientSpec(match.clients[0] ?? 'cursor').format;
      results.push(await applyRemoval({ path: match.path, format, key: match.key }, { dryRun, log: req.log }));
    }
  }
  return results;
}
