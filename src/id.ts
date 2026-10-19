export class IdError extends Error {
  readonly name = 'IdError';
  constructor(message: string) {
    super(message);
  }
}

export type ParsedId =
  | { kind: 'registry'; name: string }
  | { kind: 'github'; owner: string; repo: string };

const REVERSE_DNS = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Reverse-DNS registry name, `namespace/server`, with at least one dot in the namespace. */
export function isReverseDns(name: string): boolean {
  return REVERSE_DNS.test(name);
}

function rejectUnusable(id: string): void {
  if (id === '' || /\s/.test(id) || id.startsWith('-')) {
    throw new IdError(`Unusable id ${JSON.stringify(id)}`);
  }
}

function githubParts(owner: string, repo: string): { owner: string; repo: string } | undefined {
  if (!owner || !repo || owner.startsWith('-') || repo.startsWith('-') || /\s/.test(owner) || /\s/.test(repo)) {
    return undefined;
  }
  return { owner, repo: repo.replace(/\.git$/, '') };
}

/** `owner` and `repo` from a github.com URL, or undefined when it is not one. */
export function githubFromUrl(url: string): { owner: string; repo: string } | undefined {
  const ssh = /^git@github\.com:([^/\s]+)\/([^/\s]+)$/i.exec(url);
  if (ssh) return githubParts(ssh[1] ?? '', (ssh[2] ?? '').replace(/\.git$/, ''));
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return undefined;
  const parts = parsed.pathname.split('/').filter(Boolean);
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) return undefined;
  return githubParts(owner, repo);
}

/**
 * Registry reverse-DNS name when it is one. Otherwise `github:owner/repo`
 * taken from the repository URL.
 */
export function chooseId(input: { name?: string; repositoryUrl?: string }): string {
  if (input.name && isReverseDns(input.name)) return input.name;
  const github = input.repositoryUrl ? githubFromUrl(input.repositoryUrl) : undefined;
  if (github) return formatId({ kind: 'github', ...github });
  throw new IdError('No reverse-DNS name or GitHub repository');
}

export function parseId(id: string): ParsedId {
  rejectUnusable(id);
  if (id.startsWith('github:')) {
    const slash = id.indexOf('/', 'github:'.length);
    const owner = slash === -1 ? '' : id.slice('github:'.length, slash);
    const repo = slash === -1 ? '' : id.slice(slash + 1);
    const parts = githubParts(owner, repo);
    if (!parts || parts.repo !== repo || id.slice(slash + 1).includes('/')) {
      throw new IdError(`Unusable id ${JSON.stringify(id)}`);
    }
    return { kind: 'github', owner: parts.owner, repo: parts.repo };
  }
  if (!isReverseDns(id)) throw new IdError(`Unusable id ${JSON.stringify(id)}`);
  return { kind: 'registry', name: id };
}

export function formatId(parsed: ParsedId): string {
  if (parsed.kind === 'registry') {
    if (!isReverseDns(parsed.name)) throw new IdError(`Unusable id ${JSON.stringify(parsed.name)}`);
    return parsed.name;
  }
  const parts = githubParts(parsed.owner, parsed.repo);
  if (!parts || parts.repo !== parsed.repo) throw new IdError(`Unusable id ${JSON.stringify(parsed.owner + '/' + parsed.repo)}`);
  const id = `github:${parts.owner}/${parts.repo}`;
  rejectUnusable(id);
  return id;
}
