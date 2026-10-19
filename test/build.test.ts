import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildCatalog, CatalogError } from '../src/build.js';
import type { Source } from '../src/source.js';
import { officialSource } from '../src/sources/official.js';
import { THEME_IDS } from '../src/taxonomy.js';
import type { RawServer } from '../src/types.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/official-registry.json', import.meta.url), 'utf8')) as unknown;

const filesystem: RawServer = {
  origin: 'official',
  name: 'com.example/filesystem',
  status: 'active',
  description: 'Read and write files',
  version: '1.0.0',
  repository: { url: 'https://github.com/example/filesystem' },
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.0.0', transport: 'stdio' }],
};

function source(origin: Source['origin'], fetch: Source['fetch']): Source {
  return { origin, fetch };
}

it('builds a catalog from the official registry alone', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return Response.json(fixture);
    return Response.json({ servers: [], metadata: {} });
  };
  const catalog = await buildCatalog({
    sources: [officialSource({ fetch: fetchImpl })],
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
  expect(catalog.version).toBe(1);
  expect(catalog.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  expect(catalog.themes.map((theme) => theme.id)).toEqual([...THEME_IDS]);
  expect(catalog.servers.map((server) => [server.id, server.themes, server.official, server.singleRegistry])).toEqual([
    ['io.github.example/filesystem', ['files'], true, true],
    ['com.example/search', ['search'], true, true],
  ]);
  expect(catalog.stats.raw).toEqual({ official: 2 });
  expect(catalog.stats.sources.official).toEqual({ status: 'ok', count: 2 });
  expect(catalog.stats.merged).toBe(2);
  expect(catalog.stats.official).toBe(2);
  expect(catalog.stats.singleRegistry).toBe(2);
  expect(catalog.stats.byTheme.files).toBe(1);
  expect(catalog.stats.byTheme.search).toBe(1);
  expect(catalog.stats.byTheme.git).toBe(0);
});

it('dedupes, classifies, and counts one server seen in two origins', async () => {
  const catalog = await buildCatalog({
    sources: [
      source('official', async () => [filesystem]),
      source('glama', async () => [{ ...filesystem, origin: 'glama', description: 'Read and write local files' }]),
    ],
  });
  expect(catalog.servers).toHaveLength(1);
  expect(catalog.servers[0]).toMatchObject({
    id: 'com.example/filesystem',
    themes: ['files'],
    official: true,
    singleRegistry: false,
    origins: ['official', 'glama'],
  });
  expect(catalog.stats.raw).toEqual({ official: 1, glama: 1 });
  expect(catalog.stats.merged).toBe(1);
  expect(catalog.stats.official).toBe(1);
  expect(catalog.stats.singleRegistry).toBe(0);
  expect(catalog.stats.byTheme.files).toBe(1);
});

it('names a failed source and still builds from the others', async () => {
  const catalog = await buildCatalog({
    sources: [
      source('official', async () => [filesystem]),
      source('smithery', async () => {
        throw new Error('smithery down');
      }),
    ],
  });
  expect(catalog.servers.map((server) => server.id)).toEqual(['com.example/filesystem']);
  expect(catalog.stats.raw).toEqual({ official: 1, smithery: 0 });
  expect(catalog.stats.sources.smithery).toEqual({
    status: 'error',
    count: 0,
    error: 'smithery: smithery down',
  });
});

it('fails the build when every source fails', async () => {
  const run = buildCatalog({
    sources: [
      source('glama', async () => {
        throw new Error('glama down');
      }),
      source('mcp.so', async () => {
        throw new Error('mcp.so down');
      }),
    ],
  });
  await expect(run).rejects.toThrow(CatalogError);
  await expect(run).rejects.toThrow(/Every catalog source failed: glama: glama down; mcp\.so: mcp\.so down/);
});
