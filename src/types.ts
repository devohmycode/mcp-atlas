export const ORIGINS = ['official', 'glama', 'smithery', 'mcp.so', 'pulsemcp'] as const;
export type Origin = (typeof ORIGINS)[number];

export const TRANSPORTS = ['stdio', 'sse', 'streamable-http'] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const SCOPES = ['project', 'user'] as const;
export type Scope = (typeof SCOPES)[number];

export const CLIENT_IDS = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'codex-cli',
  'codex-desktop',
  'grok',
] as const;
export type ClientId = (typeof CLIENT_IDS)[number];

/** A package the server can be started from, as a registry described it. */
export interface PackageRef {
  registryType: string;
  identifier: string;
  version?: string;
  transport: Transport;
}

/** A remote endpoint the server is already running on. */
export interface RemoteRef {
  type: Exclude<Transport, 'stdio'>;
  url: string;
}

export interface Repository {
  url: string;
}

/** One source's view of a server, before merging. */
export interface RawServer {
  origin: Origin;
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: Repository;
  packages?: PackageRef[];
  remotes?: RemoteRef[];
  /**
   * Official-registry status (`active`, `deprecated`). Set only for that
   * origin. The official mark requires `active`.
   */
  status?: string;
}

/** A merged catalog entry. */
export interface Server {
  id: string;
  name: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: Repository;
  packages: PackageRef[];
  remotes: RemoteRef[];
  origins: Origin[];
  /** Theme ids. Empty until classification. */
  themes: string[];
  official: boolean;
  /** True when the server was seen in only one source. */
  singleRegistry: boolean;
}

export interface Theme {
  id: string;
  label: string;
  description?: string;
}

/** Outcome of one source during a build. A failure is named in `error` and skipped. */
export interface SourceReport {
  status: 'ok' | 'error';
  count: number;
  error?: string;
}

export interface CatalogStats {
  /** Raw records kept from each requested origin. A skipped source counts as 0. */
  raw: Partial<Record<Origin, number>>;
  sources: Partial<Record<Origin, SourceReport>>;
  merged: number;
  official: number;
  singleRegistry: number;
  byTheme: Record<string, number>;
}

export interface Catalog {
  version: 1;
  generatedAt: string;
  themes: Theme[];
  servers: Server[];
  stats: CatalogStats;
}
