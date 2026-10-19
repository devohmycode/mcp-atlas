import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CLIENT_IDS, SCOPES, type ClientId, type Scope } from './types.js';

/** Choices remembered between runs. */
export interface UserConfig {
  /**
   * Persistent audit switch. `false` installs without the audit.
   * Absent means the audit stays on.
   */
  audit?: boolean;
  /** Clients picked last time, offered first by the wizard and used by `-y`. */
  agents?: ClientId[];
  scope?: Scope;
  lang?: string;
}

/** `~/.config/mcp-atlas/config.json`, or under `XDG_CONFIG_HOME` when that is set. */
export function configPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg ? xdg : join(home, '.config');
  return join(base, 'mcp-atlas', 'config.json');
}

/** Missing or unreadable config means the defaults, so the audit stays on. A bad field is dropped. */
export function readConfig(path = configPath()): UserConfig {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const raw = parsed as Record<string, unknown>;
    const config: UserConfig = {};
    if (typeof raw.audit === 'boolean') config.audit = raw.audit;
    if (Array.isArray(raw.agents)) {
      const agents = raw.agents.filter((id): id is ClientId => CLIENT_IDS.includes(id as ClientId));
      if (agents.length) config.agents = agents;
    }
    if (SCOPES.includes(raw.scope as Scope)) config.scope = raw.scope as Scope;
    if (typeof raw.lang === 'string') config.lang = raw.lang;
    return config;
  } catch {
    return {};
  }
}

export function writeConfig(config: UserConfig, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}
