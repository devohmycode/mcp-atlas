import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { USER_AGENT } from '../src/http.js';
import { ReadmeError, readReadme } from '../src/readme.js';
import type { Catalog, Server } from '../src/types.js';

const fixture = readFileSync(new URL('./fixtures/readme.md', import.meta.url), 'utf8');

function server(partial: Partial<Server> & Pick<Server, 'id'>): Server {
  return {
    name: partial.id,
    packages: [],
    remotes: [],
    origins: ['official'],
    themes: [],
    official: false,
    singleRegistry: true,
    ...partial,
  };
}

function catalog(servers: Server[]): Catalog {
  return {
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    themes: [],
    servers,
    stats: { raw: {}, sources: {}, merged: servers.length, official: 0, singleRegistry: 0, byTheme: {} },
  };
}

const id = 'com.example/filesystem';

it('reads the README from the raw GitHub URL', async () => {
  const seen: string[] = [];
  const text = await readReadme(catalog([server({ id, repository: { url: 'https://github.com/example/filesystem.git' } })]), id, {
    fetch: async (input, init) => {
      seen.push(String(input));
      expect(new Headers(init?.headers).get('user-agent')).toBe(USER_AGENT);
      return new Response(fixture, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    },
  });
  expect(seen).toEqual(['https://raw.githubusercontent.com/example/filesystem/HEAD/README.md']);
  expect(text).toBe(fixture);
});

it('names the server when the README is missing', async () => {
  await expect(
    readReadme(catalog([server({ id, repository: { url: 'https://github.com/example/filesystem' } })]), id, {
      fetch: async () => new Response('no', { status: 404, headers: { 'content-type': 'text/plain' } }),
    }),
  ).rejects.toThrow(new ReadmeError(`Could not read the README for ${id} (404)`));
});

it('reports an unknown id, a missing repository, and a non-GitHub repository', async () => {
  const snap = catalog([
    server({ id: 'com.example/norepo' }),
    server({ id: 'com.example/gitlab', repository: { url: 'https://gitlab.com/example/filesystem' } }),
  ]);
  await expect(readReadme(snap, 'com.example/missing')).rejects.toThrow(/Unknown server com\.example\/missing/);
  await expect(readReadme(snap, 'com.example/norepo')).rejects.toThrow(/No repository for com\.example\/norepo/);
  await expect(readReadme(snap, 'com.example/gitlab')).rejects.toThrow(/No GitHub repository for com\.example\/gitlab/);
});
