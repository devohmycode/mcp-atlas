import { fetchText, HttpError } from './http.js';
import { githubFromUrl } from './id.js';
import type { Catalog } from './types.js';

export class ReadmeError extends Error {
  readonly name = 'ReadmeError';
  constructor(message: string) {
    super(message);
  }
}

export interface ReadmeOptions {
  fetch?: typeof fetch;
}

/**
 * Reads `README.md` from the declared GitHub repository via raw.githubusercontent.com.
 * `HEAD` follows the default branch. No clone, and no server process.
 */
export async function readReadme(catalog: Catalog, id: string, opts: ReadmeOptions = {}): Promise<string> {
  const server = catalog.servers.find((item) => item.id === id);
  if (!server) throw new ReadmeError(`Unknown server ${id}`);
  const repoUrl = server.repository?.url;
  if (!repoUrl) throw new ReadmeError(`No repository for ${id}`);
  const github = githubFromUrl(repoUrl);
  if (!github) throw new ReadmeError(`No GitHub repository for ${id}`);
  const raw = `https://raw.githubusercontent.com/${github.owner}/${github.repo}/HEAD/README.md`;
  try {
    return await fetchText(raw, { fetch: opts.fetch });
  } catch (err) {
    const status = err instanceof HttpError ? ` (${err.status})` : '';
    throw new ReadmeError(`Could not read the README for ${id}${status}`);
  }
}
