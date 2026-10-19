import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { officialRegistryUrl, officialSource, parseOfficialPage } from '../src/sources/official.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/official-registry.json', import.meta.url), 'utf8')) as unknown;

it('reads the fixture and drops deleted servers', () => {
  const page = parseOfficialPage(fixture);
  expect(page.nextCursor).toBe('abc/def+1');
  expect(page.servers.map((server) => server.name)).toEqual(['io.github.example/filesystem', 'com.example/search']);
  const filesystem = page.servers[0];
  expect(filesystem).toMatchObject({
    origin: 'official',
    description: 'Read and write files',
    version: '1.2.3',
    repository: { url: 'https://github.com/example/filesystem' },
    packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' }],
    remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
    status: 'active',
  });
});

it('keeps a deprecated server and records that status', () => {
  const page = parseOfficialPage({
    servers: [
      {
        server: { name: 'com.example/old', description: 'Old', version: '0.0.1', status: 'deprecated' },
      },
    ],
  });
  expect(page.servers.map((server) => ({ name: server.name, status: server.status }))).toEqual([
    { name: 'com.example/old', status: 'deprecated' },
  ]);
});

it('pages with the returned cursor and never asks for more than 100', async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    seen.push(String(url));
    if (seen.length === 1) return Response.json(fixture);
    return Response.json({
      servers: [
        {
          server: { name: 'io.github.example/second', description: 'Second', version: '1.0.0' },
        },
      ],
      metadata: { nextCursor: '' },
    });
  };
  const servers = await officialSource({ limit: 500, fetch: fetchImpl }).fetch();
  expect(servers.map((server) => server.name)).toEqual([
    'io.github.example/filesystem',
    'com.example/search',
    'io.github.example/second',
  ]);
  expect(seen).toHaveLength(2);
  expect(seen[0]).toBe(officialRegistryUrl(undefined, 500));
  expect(seen[0]).toContain('version=latest');
  expect(seen[0]).toContain('limit=100');
  expect(seen[1]).toContain(`cursor=${encodeURIComponent('abc/def+1')}`);
  expect(seen[1]).toContain('limit=100');
});

it('names the official source', () => {
  expect(officialSource().origin).toBe('official');
});
