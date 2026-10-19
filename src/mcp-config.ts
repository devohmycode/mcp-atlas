import { parse, stringify } from 'smol-toml';

export class PlanError extends Error {
  readonly name = 'PlanError';
  constructor(message: string) {
    super(message);
  }
}

/** JSON `command` / `args` / `env`, or a remote `url`. */
export type ServerEntry =
  | { command: string; args: string[]; env?: Record<string, string>; url?: undefined }
  | { url: string; command?: undefined; args?: undefined; env?: undefined };

export interface UntouchedKey {
  key: string;
  value: unknown;
}

export interface ConfigFile {
  /** Keys other than the server map, in file order. */
  rest: UntouchedKey[];
  servers: Record<string, unknown>;
}

/** Reads a client file. An empty or missing text is an empty config. Invalid JSON or TOML names the path. */
export function readConfigFile(format: 'json' | 'toml', text: string | undefined, path: string): ConfigFile {
  if (text === undefined || text.trim() === '') return { rest: [], servers: {} };
  return format === 'json' ? readJson(text, path) : readToml(text, path);
}

/**
 * Renders the file with `entry` merged under `key`. Other keys stay.
 * Undefined entry fields are omitted.
 */
export function renderConfig(format: 'json' | 'toml', file: ConfigFile, key: string, entry: ServerEntry): string {
  return renderDocument(format, { ...file.servers, [key]: entryRecord(entry) }, file);
}

/** The same file with one server key removed. Every other key stays. */
export function renderWithout(format: 'json' | 'toml', file: ConfigFile, key: string): string {
  const servers = { ...file.servers };
  delete servers[key];
  return renderDocument(format, servers, file);
}

function renderDocument(format: 'json' | 'toml', servers: Record<string, unknown>, file: ConfigFile): string {
  const doc: Record<string, unknown> = {};
  for (const item of file.rest) doc[item.key] = item.value;
  if (format === 'json') {
    doc.mcpServers = servers;
    return `${JSON.stringify(doc, null, 2)}\n`;
  }
  doc.mcp_servers = servers;
  return stringify(doc);
}

function entryRecord(entry: ServerEntry): Record<string, unknown> {
  if (entry.url !== undefined) return { url: entry.url };
  const record: Record<string, unknown> = { command: entry.command, args: entry.args };
  if (entry.env !== undefined) record.env = entry.env;
  return record;
}

function readJson(text: string, path: string): ConfigFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new PlanError(`${path} is not JSON`);
  }
  const record = objectOf(parsed, path);
  const servers = record.mcpServers === undefined ? {} : objectOf(record.mcpServers, `${path} mcpServers`);
  const rest = Object.entries(record)
    .filter(([key]) => key !== 'mcpServers')
    .map(([key, value]) => ({ key, value }));
  return { rest, servers };
}

function readToml(text: string, path: string): ConfigFile {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch {
    throw new PlanError(`${path} is not TOML`);
  }
  const record = objectOf(parsed, path);
  const servers = record.mcp_servers === undefined ? {} : objectOf(record.mcp_servers, `${path} mcp_servers`);
  const rest = Object.entries(record)
    .filter(([key]) => key !== 'mcp_servers')
    .map(([key, value]) => ({ key, value }));
  return { rest, servers };
}

function objectOf(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PlanError(`${where} is not an object`);
  }
  return value as Record<string, unknown>;
}
