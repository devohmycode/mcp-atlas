import { auditAllows, auditServer } from './audit.js';
import { clientConfigPath, clientSpec, type PathContext } from './clients.js';
import { proposeCommand, type ProposedCommand } from './command.js';
import { PlanError, readConfigFile, type ConfigFile, type ServerEntry, type UntouchedKey } from './mcp-config.js';
import type { ClientId, Scope, Server } from './types.js';

export { PlanError, type ServerEntry, type UntouchedKey };

/** One file to write. Codex CLI and Codex desktop share a file, so they are one entry. */
export interface FilePlan {
  clients: ClientId[];
  path: string;
  format: 'json' | 'toml';
  /** Object key, and the suffix of `[mcp_servers.<key>]` for TOML. */
  key: string;
  /** TOML table header without the brackets. Absent for JSON. */
  table?: string;
  entry: ServerEntry;
  /** Set when `key` is already in the file. The current value stays visible. */
  collision?: unknown;
  /** Every other key of the file, kept as it is. */
  untouched: UntouchedKey[];
}

type PlanServer = Pick<Server, 'id' | 'name' | 'version' | 'packages' | 'remotes' | 'repository'>;

export interface PlanInput {
  server: PlanServer;
  clients: readonly ClientId[];
  scope: Scope;
  ctx: PathContext;
  /** Existing file text, keyed by the absolute path. A missing path is a new file. */
  files?: ReadonlyMap<string, string>;
  /** Copied onto a stdio entry as `env`. */
  env?: Record<string, string>;
  /** Persistent audit switch. `audit: false` allows a plan that would otherwise be refused. */
  config?: { audit?: boolean };
  /** Pass `false` for `--no-audit` on this invocation. */
  enabled?: boolean;
}

/**
 * Describes the writes for one fiche. A failed audit throws and returns no plan,
 * unless the audit is off for this run or in the config. Nothing is written.
 */
export function planInstall(input: PlanInput): FilePlan[] {
  const result = auditServer(input.server);
  if (!auditAllows(result, input.config ?? {}, input.enabled)) {
    throw new PlanError(`Audit failed for ${input.server.id}`);
  }
  const command = proposeCommand(input.server);
  const key = configKey(input.server);
  const entry = entryOf(command, input.env);
  const plans: FilePlan[] = [];
  for (const id of input.clients) {
    const path = clientConfigPath(id, input.scope, input.ctx);
    const existing = plans.find((plan) => plan.path === path);
    if (existing) {
      existing.clients.push(id);
      continue;
    }
    const spec = clientSpec(id);
    const file = readConfigFile(spec.format, input.files?.get(path), path);
    const collision = file.servers[key];
    plans.push({
      clients: [id],
      path,
      format: spec.format,
      key,
      table: spec.format === 'toml' ? `${spec.writable}.${key}` : undefined,
      entry,
      collision,
      untouched: untouched(spec.format === 'toml' ? 'mcp_servers' : 'mcpServers', file, key),
    });
  }
  return plans;
}

/** Last segment of the name, kept as a single TOML key. */
function configKey(server: Pick<Server, 'id' | 'name'>): string {
  const source = server.name || server.id;
  const leaf = source.slice(source.lastIndexOf('/') + 1).replace(/[^A-Za-z0-9_-]/g, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(leaf)) throw new PlanError(`Unusable config key for ${server.id}`);
  return leaf;
}

function entryOf(command: ProposedCommand, env: Record<string, string> | undefined): ServerEntry {
  if (command.kind === 'remote') return { url: command.url };
  const entry: ServerEntry = { command: command.command, args: command.args };
  if (env && Object.keys(env).length > 0) entry.env = env;
  return entry;
}

function untouched(family: string, file: ConfigFile, key: string): UntouchedKey[] {
  const siblings = Object.entries(file.servers)
    .filter(([name]) => name !== key)
    .map(([name, value]) => ({ key: `${family}.${name}`, value }));
  return [...file.rest, ...siblings];
}
