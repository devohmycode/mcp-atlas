import { posix, win32 } from 'node:path';
import { CLIENT_IDS, type ClientId, type Scope } from './types.js';

type PlatformPath = Pick<typeof win32, 'join'>;

export type ConfigFormat = 'json' | 'toml';
/** JSON object key, or the TOML table family `[mcp_servers.<name>]`. Nothing else in the file is written. */
export type WritableKey = 'mcpServers' | 'mcp_servers';

export interface ClientSpec {
  id: ClientId;
  format: ConfigFormat;
  writable: WritableKey;
  scopes: readonly Scope[];
  /** Codex reads the project file only after the project is trusted. The path is still this one. */
  projectTrustedOnly?: boolean;
  /** Writes the same files as this client. Selecting both is one write. */
  sameFilesAs?: ClientId;
}

export const CLIENTS: readonly ClientSpec[] = [
  { id: 'claude-code', format: 'json', writable: 'mcpServers', scopes: ['project', 'user'] },
  { id: 'claude-desktop', format: 'json', writable: 'mcpServers', scopes: ['user'] },
  { id: 'cursor', format: 'json', writable: 'mcpServers', scopes: ['project', 'user'] },
  {
    id: 'codex-cli',
    format: 'toml',
    writable: 'mcp_servers',
    scopes: ['project', 'user'],
    projectTrustedOnly: true,
  },
  {
    id: 'codex-desktop',
    format: 'toml',
    writable: 'mcp_servers',
    scopes: ['project', 'user'],
    projectTrustedOnly: true,
    sameFilesAs: 'codex-cli',
  },
  { id: 'grok', format: 'toml', writable: 'mcp_servers', scopes: ['project', 'user'] },
];

export interface PathContext {
  platform: NodeJS.Platform;
  home: string;
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
}

export class ClientPathError extends Error {
  readonly name = 'ClientPathError';
  constructor(message: string) {
    super(message);
  }
}

export function clientSpec(id: ClientId): ClientSpec {
  const spec = CLIENTS.find((c) => c.id === id);
  if (!spec) throw new ClientPathError(`Unknown client ${id}`);
  return spec;
}

/**
 * Absolute config path for one client and scope.
 *
 * Claude Code's user file is `~/.claude.json` (top-level `mcpServers`), or
 * `$CLAUDE_CONFIG_DIR/.claude.json` when that variable is set. Docs:
 * https://code.claude.com/docs/en/mcp-quickstart
 * Codex's user file moves with `CODEX_HOME`.
 */
export function clientConfigPath(id: ClientId, scope: Scope, ctx: PathContext): string {
  const spec = clientSpec(id);
  if (!spec.scopes.includes(scope)) throw new ClientPathError(`${id} has no ${scope} config`);
  const path = ctx.platform === 'win32' ? win32 : posix;
  const env = ctx.env ?? {};
  if (scope === 'project') {
    if (!ctx.projectRoot) throw new ClientPathError(`project root required for ${id}`);
    return path.join(ctx.projectRoot, projectRelative(id));
  }
  const userId: Exclude<ClientId, 'codex-desktop'> = id === 'codex-desktop' ? 'codex-cli' : id;
  return userPath(userId, ctx, env, path);
}

function projectRelative(id: ClientId): string {
  switch (id) {
    case 'claude-code':
      return '.mcp.json';
    case 'cursor':
      return '.cursor/mcp.json';
    case 'codex-cli':
    case 'codex-desktop':
      return '.codex/config.toml';
    case 'grok':
      return '.grok/config.toml';
    case 'claude-desktop':
      throw new ClientPathError('claude-desktop has no project config');
    default: {
      const never: never = id;
      return never;
    }
  }
}

function userPath(
  id: Exclude<ClientId, 'codex-desktop'>,
  ctx: PathContext,
  env: NodeJS.ProcessEnv,
  path: PlatformPath,
): string {
  const { home, platform } = ctx;
  switch (id) {
    case 'claude-code':
      return path.join(env.CLAUDE_CONFIG_DIR || home, '.claude.json');
    case 'claude-desktop':
      if (platform === 'win32') {
        const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
        return path.join(appData, 'Claude', 'claude_desktop_config.json');
      }
      if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      }
      return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    case 'cursor':
      return path.join(home, '.cursor', 'mcp.json');
    case 'codex-cli':
      return path.join(env.CODEX_HOME || path.join(home, '.codex'), 'config.toml');
    case 'grok':
      return path.join(home, '.grok', 'config.toml');
    default: {
      const never: never = id;
      return never;
    }
  }
}

/** Every {@link ClientId} has one row. */
export function clientsCovered(): boolean {
  return CLIENT_IDS.every((id) => CLIENTS.some((c) => c.id === id)) && CLIENTS.length === CLIENT_IDS.length;
}
