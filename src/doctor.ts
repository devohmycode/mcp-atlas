import { existsSync, readFileSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { clientConfigPath, clientSpec } from './clients.js';
import { readConfigFile } from './mcp-config.js';
import { clientsIn } from './manage.js';
import { operateContext, type OperateContext } from './operate.js';
import type { ClientId, Scope } from './types.js';

export type IssueCode = 'unreadable-config' | 'invalid-config' | 'invalid-entry' | 'missing-command';

export interface Issue {
  code: IssueCode;
  scope: Scope;
  path: string;
  clients: ClientId[];
  /** Server key, for an issue with one entry. */
  key?: string;
  detail?: string;
}

export interface DoctorDeps {
  exists?: (path: string) => boolean;
  read?: (path: string) => string;
}

/** True when `command` runs as typed: a path that exists, or a name found in PATH (with PATHEXT on Windows). */
export function onPath(command: string, ctx: OperateContext, exists: (path: string) => boolean = existsSync): boolean {
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) return exists(isAbsolute(command) ? command : join(ctx.cwd, command));
  const env = ctx.env ?? process.env;
  const dirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  const exts = ctx.platform === 'win32' ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
  return dirs.some((dir) => exts.some((ext) => exists(join(dir, command + ext)) || exists(join(dir, command + ext.toLowerCase()))));
}

/** Reads every client file of `scopes` and names what would keep a server from starting. Writes nothing. */
export function diagnose(ctx: OperateContext, scopes: readonly Scope[], only?: readonly ClientId[], deps: DoctorDeps = {}): Issue[] {
  const exists = deps.exists ?? existsSync;
  const read = deps.read ?? ((path: string) => readFileSync(path, 'utf8'));
  const issues: Issue[] = [];
  for (const scope of scopes) {
    const files = new Map<string, ClientId[]>();
    for (const id of clientsIn(scope, only)) {
      const path = clientConfigPath(id, scope, operateContext(ctx));
      files.set(path, [...(files.get(path) ?? []), id]);
    }
    for (const [path, clients] of files) {
      if (!exists(path)) continue;
      let text: string;
      try {
        text = read(path);
      } catch (err) {
        issues.push({ code: 'unreadable-config', scope, path, clients, detail: (err as Error).message });
        continue;
      }
      let servers: Record<string, unknown>;
      try {
        servers = readConfigFile(clientSpec(clients[0]!).format, text, path).servers;
      } catch (err) {
        issues.push({ code: 'invalid-config', scope, path, clients, detail: (err as Error).message });
        continue;
      }
      for (const [key, value] of Object.entries(servers)) {
        const entry = (typeof value === 'object' && value !== null ? value : {}) as { command?: unknown; url?: unknown };
        if (typeof entry.url === 'string') continue;
        if (typeof entry.command !== 'string' || entry.command === '') issues.push({ code: 'invalid-entry', scope, path, clients, key });
        else if (!onPath(entry.command, ctx, exists)) issues.push({ code: 'missing-command', scope, path, clients, key, detail: entry.command });
      }
    }
  }
  return issues;
}
