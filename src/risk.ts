import type { ProposedCommand } from './command.js';

export type RiskLevel = 'high' | 'medium' | 'info';

export type RiskCode =
  | 'pipe-to-shell'
  | 'unpinned'
  | 'secret-path'
  | 'foreign-url'
  | 'sensitive-name'
  | 'pinned'
  | 'image';

export interface Risk {
  level: RiskLevel;
  code: RiskCode;
  detail: string;
}

export interface RiskInput {
  command?: ProposedCommand;
  /** Extra command text. Scanned with the proposed command and the variable values. */
  text?: string;
  variables?: readonly { name: string; value?: string }[];
  /** Declared source repository. Its host is allowed for a remote URL. */
  repositoryUrl?: string;
}

/** Hosts of the catalogs this project reads. A remote on one of them is not foreign. */
const REGISTRY_HOSTS = new Set([
  'registry.modelcontextprotocol.io',
  'glama.ai',
  'registry.smithery.ai',
  'mcp.so',
  'api.pulsemcp.com',
]);

const LEVEL_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, info: 2 };
const CODE_RANK: Record<RiskCode, number> = {
  'pipe-to-shell': 0,
  unpinned: 1,
  'secret-path': 2,
  'foreign-url': 3,
  'sensitive-name': 4,
  pinned: 5,
  image: 6,
};

const SENSITIVE_NAME = /KEY|TOKEN|SECRET|PASSWORD/i;

/**
 * Reads the command text and the variables. Nothing is executed.
 * High: a download piped to a shell, an unpinned `npx -y` or `uvx`, a secret
 * path, or a URL whose host is neither the repository nor a registry.
 * Medium: a variable name that carries a credential word.
 * Info: a pinned package, or a Docker or OCI image.
 */
export function assessRisks(input: RiskInput): Risk[] {
  const risks: Risk[] = [];
  const text = scannedText(input);
  if (/\bcurl\b[^|\n]*\|\s*(?:sh|bash)\b/i.test(text)) {
    risks.push({ level: 'high', code: 'pipe-to-shell', detail: 'Command downloads and executes a script (curl|sh)' });
  }
  if (input.command?.kind === 'stdio' && input.command.unpinned || textHasUnpinned(text)) {
    risks.push({ level: 'high', code: 'unpinned', detail: 'npx -y or uvx without a version' });
  }
  if (/~\/\.(?:ssh|aws)(?![a-z0-9])/i.test(text)) {
    risks.push({ level: 'high', code: 'secret-path', detail: 'Reads ~/.ssh or ~/.aws' });
  }
  for (const host of foreignHosts(text, input.repositoryUrl)) {
    risks.push({
      level: 'high',
      code: 'foreign-url',
      detail: `Remote host ${host} is neither the repository nor a registry`,
    });
  }
  for (const variable of input.variables ?? []) {
    const hit = SENSITIVE_NAME.exec(variable.name);
    if (!hit) continue;
    risks.push({
      level: 'medium',
      code: 'sensitive-name',
      detail: `Variable ${variable.name} contains ${hit[0].toUpperCase()}`,
    });
  }
  const command = input.command;
  if (command?.kind === 'stdio' && !command.unpinned && (command.runtime === 'npm' || command.runtime === 'pypi')) {
    risks.push({ level: 'info', code: 'pinned', detail: 'Pinned package' });
  }
  if (command?.kind === 'stdio' && (command.runtime === 'docker' || command.runtime === 'oci')) {
    risks.push({ level: 'info', code: 'image', detail: 'Docker image' });
  }
  risks.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || CODE_RANK[a.code] - CODE_RANK[b.code] || a.detail.localeCompare(b.detail));
  return risks;
}

function scannedText(input: RiskInput): string {
  const parts: string[] = [];
  if (input.text) parts.push(input.text);
  const command = input.command;
  if (command?.kind === 'stdio') parts.push([command.command, ...command.args].join(' '));
  if (command?.kind === 'remote') parts.push(command.url);
  for (const variable of input.variables ?? []) {
    if (variable.value) parts.push(variable.value);
  }
  return parts.join('\n');
}

function textHasUnpinned(text: string): boolean {
  if (/(?:^|\s)npx\s+(?:-y|--yes)(?:\s|$)/i.test(text)) return true;
  for (const match of text.matchAll(/(?:^|\s)uvx\s+(\S+)/gi)) {
    const arg = match[1] ?? '';
    if (arg.startsWith('-')) continue;
    if (!arg.includes('==')) return true;
  }
  return false;
}

function foreignHosts(text: string, repositoryUrl: string | undefined): string[] {
  const allowed = new Set(REGISTRY_HOSTS);
  const repositoryHost = hostOf(repositoryUrl);
  if (repositoryHost) allowed.add(repositoryHost);
  const found = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s'")]+/gi)) {
    const host = hostOf(match[0]);
    if (!host || allowed.has(host)) continue;
    found.add(host);
  }
  return [...found].sort();
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return undefined;
  }
}
