import { posix, win32 } from 'node:path';
import { clientConfigPath, type PathContext } from './clients.js';
import { CLIENT_IDS, type ClientId } from './types.js';

type PlatformPath = Pick<typeof win32, 'join' | 'dirname'>;

/**
 * Clients whose executable or config directory exists.
 * `codex-desktop` matches the desktop app only. `~/.codex` marks `codex-cli`, not the app.
 * `exists` is injected so this never reads the machine it is tested on.
 */
export function detectClients(exists: (path: string) => boolean, ctx: PathContext): ClientId[] {
  return CLIENT_IDS.filter((id) => detectionPaths(id, ctx).some((path) => exists(path)));
}

/** Paths that count as "installed" for one client. Empty for `codex-desktop` on Linux. */
export function detectionPaths(id: ClientId, ctx: PathContext): string[] {
  const path = ctx.platform === 'win32' ? win32 : posix;
  if (id === 'codex-desktop') return appPaths(id, ctx, path);
  const paths = new Set<string>(appPaths(id, ctx, path));
  paths.add(clientConfigPath(id, 'user', ctx));
  const dir = configDir(id, ctx, path);
  if (dir) paths.add(dir);
  for (const executable of executablePaths(id, ctx, path)) paths.add(executable);
  return [...paths];
}

function configDir(id: ClientId, ctx: PathContext, path: PlatformPath): string | undefined {
  if (id === 'claude-code') return path.join(ctx.env?.CLAUDE_CONFIG_DIR || ctx.home, '.claude');
  const file = clientConfigPath(id, 'user', ctx);
  const dir = path.dirname(file);
  return dir === ctx.home ? undefined : dir;
}

function executablePaths(id: ClientId, ctx: PathContext, path: PlatformPath): string[] {
  const names = executableNames(id);
  if (names.length === 0) return [];
  const dirs = binDirs(ctx, path);
  const suffix = ctx.platform === 'win32' ? ['.exe', '.cmd'] : [''];
  const paths: string[] = [];
  for (const dir of dirs) {
    for (const name of names) {
      for (const ext of suffix) paths.push(path.join(dir, name + ext));
    }
  }
  return paths;
}

function executableNames(id: ClientId): string[] {
  switch (id) {
    case 'claude-code':
      return ['claude'];
    case 'cursor':
      return ['cursor'];
    case 'codex-cli':
      return ['codex'];
    case 'grok':
      return ['grok'];
    case 'claude-desktop':
    case 'codex-desktop':
      return [];
    default: {
      const never: never = id;
      return never;
    }
  }
}

function binDirs(ctx: PathContext, path: PlatformPath): string[] {
  const env = ctx.env ?? {};
  if (ctx.platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(ctx.home, 'AppData', 'Local');
    const roaming = env.APPDATA || path.join(ctx.home, 'AppData', 'Roaming');
    return [path.join(ctx.home, '.local', 'bin'), path.join(roaming, 'npm'), local];
  }
  return ['/usr/local/bin', '/opt/homebrew/bin', path.join(ctx.home, '.local', 'bin')];
}

/**
 * Desktop app bundles. Codex's CLI looks for `ChatGPT.app` or `Codex.app` on macOS.
 * There is no Codex desktop build on Linux, so that list is empty there.
 */
function appPaths(id: ClientId, ctx: PathContext, path: PlatformPath): string[] {
  const names = appNames(id);
  if (names.length === 0) return [];
  if (ctx.platform === 'darwin') {
    return names.flatMap((name) => [`/Applications/${name}.app`, path.join(ctx.home, 'Applications', `${name}.app`)]);
  }
  if (ctx.platform !== 'win32') return [];
  const local = ctx.env?.LOCALAPPDATA || path.join(ctx.home, 'AppData', 'Local');
  return names.flatMap((name) => [
    path.join(local, 'Microsoft', 'WindowsApps', `${name}.exe`),
    path.join(local, 'Programs', name, `${name}.exe`),
  ]);
}

function appNames(id: ClientId): string[] {
  switch (id) {
    case 'codex-desktop':
      return ['ChatGPT', 'Codex'];
    case 'claude-desktop':
      return ['Claude'];
    case 'cursor':
      return ['Cursor'];
    default:
      return [];
  }
}
