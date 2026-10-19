import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { glamaSource, glamaUrl, parseGlamaPage } from '../src/sources/glama.js';
import { parseOfficialPage } from '../src/sources/official.js';
import { pulseSource, pulseUrl } from '../src/sources/pulsemcp.js';
import { parseSmitheryPage, smitherySource, smitheryUrl } from '../src/sources/smithery.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const glama = fixture('glama.json');
const smithery = fixture('smithery.json');
const pulse = fixture('pulsemcp.json');

it('reads a Glama page into raw servers', () => {
  const page = parseGlamaPage(glama);
  expect(page.nextCursor).toBeUndefined();
  expect(page.servers).toEqual([
    {
      origin: 'glama',
      name: 'io.github.example/filesystem',
      description: 'Read and write files',
      repository: { url: 'https://github.com/example/filesystem' },
      packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '9.9.9', transport: 'stdio' }],
      remotes: [{ type: 'streamable-http', url: 'https://glama.example/mcp' }],
    },
  ]);
});

it('says the Glama contract moved when the page shape changes', () => {
  const moved = clone(glama) as { pageInfo?: unknown };
  delete moved.pageInfo;
  expect(() => parseGlamaPage(moved)).toThrow(/contrat a bougé \(glama\)/i);
  expect(() => parseGlamaPage({ servers: [], pageInfo: { hasNextPage: true } })).toThrow(/contrat a bougé/i);
  expect(() =>
    parseGlamaPage({
      servers: [{ name: 'io.github.example/filesystem', remotes: [{ type: 'stdio', url: 'x' }] }],
      pageInfo: { hasNextPage: false },
    }),
  ).toThrow(/contrat a bougé/i);
});

it('pages Glama with the end cursor and does not use the network', async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    seen.push(String(url));
    if (seen.length === 1) {
      return Response.json({
        servers: [{ name: 'io.github.example/filesystem', description: 'Files' }],
        pageInfo: { hasNextPage: true, endCursor: 'cursor/1' },
      });
    }
    return Response.json({
      servers: [{ name: 'io.github.example/second', description: 'Second' }],
      pageInfo: { hasNextPage: false },
    });
  };
  const servers = await glamaSource({ fetch: fetchImpl }).fetch();
  expect(glamaSource().origin).toBe('glama');
  expect(servers.map((server) => server.name)).toEqual(['io.github.example/filesystem', 'io.github.example/second']);
  expect(seen).toEqual([glamaUrl(), glamaUrl('cursor/1')]);
  expect(seen[1]).toContain('after=cursor%2F1');
  expect(seen[1]).toContain('first=100');
});

it('reads a Smithery page into raw servers', () => {
  const page = parseSmitheryPage(smithery);
  expect(page.totalPages).toBe(1);
  expect(page.servers).toEqual([
    {
      origin: 'smithery',
      name: 'io.github.example/filesystem',
      title: 'Filesystem',
      description: 'Read and write files',
      repository: { url: 'https://github.com/example/filesystem' },
      remotes: [{ type: 'streamable-http', url: 'https://smithery.example/mcp' }],
    },
  ]);
});

it('says the Smithery contract moved when the page shape changes', () => {
  const moved = clone(smithery) as { pagination?: { totalPages?: unknown } };
  delete moved.pagination?.totalPages;
  expect(() => parseSmitheryPage(moved)).toThrow(/contrat a bougé \(smithery\)/i);
  expect(() => parseSmitheryPage({ servers: [{ displayName: 'Brave' }], pagination: { totalPages: 1 } })).toThrow(
    /contrat a bougé/i,
  );
});

it('pages Smithery by page number and does not use the network', async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    seen.push(String(url));
    if (seen.length === 1) {
      return Response.json({
        servers: [{ qualifiedName: 'io.github.example/filesystem', description: 'Files' }],
        pagination: { totalPages: 2 },
      });
    }
    return Response.json({
      servers: [{ qualifiedName: 'io.github.example/second', description: 'Second' }],
      pagination: { totalPages: 2 },
    });
  };
  const servers = await smitherySource({ fetch: fetchImpl }).fetch();
  expect(smitherySource().origin).toBe('smithery');
  expect(servers.map((server) => server.name)).toEqual(['io.github.example/filesystem', 'io.github.example/second']);
  expect(seen).toEqual([smitheryUrl(1), smitheryUrl(2)]);
  expect(seen[0]).toContain('pageSize=100');
  expect(seen[0]).toContain('seed=1');
});

it('keeps one Smithery entry per qualifiedName across pages', async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json({ servers: [{ qualifiedName: 'same' }], pagination: { totalPages: 2 } });
  const servers = await smitherySource({ fetch: fetchImpl }).fetch();
  expect(servers.map((server) => server.name)).toEqual(['same']);
});

it('stops Smithery at totalPages even when the next page would answer', async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    seen.push(String(url));
    return Response.json({ servers: [{ qualifiedName: `s${seen.length}` }], pagination: { totalPages: 3 } });
  };
  const servers = await smitherySource({ fetch: fetchImpl }).fetch();
  expect(servers).toHaveLength(3);
  expect(seen).toEqual([smitheryUrl(1), smitheryUrl(2), smitheryUrl(3)]);
});

it('reads a PulseMCP page with the official registry contract', () => {
  const page = parseOfficialPage(pulse, 'pulsemcp');
  expect(page.nextCursor).toBeUndefined();
  expect(page.servers).toEqual([
    {
      origin: 'pulsemcp',
      name: 'io.github.example/filesystem',
      title: undefined,
      description: 'Read and write files',
      version: '1.2.3',
      repository: { url: 'https://github.com/example/filesystem' },
      packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' }],
      remotes: [],
      status: 'active',
    },
  ]);
});

it('pages PulseMCP by cursor with its API headers and does not use the network', async () => {
  const seen: string[] = [];
  let headers = new Headers();
  const entry = (name: string) => ({ server: { name } });
  const fetchImpl: typeof fetch = async (url, init) => {
    seen.push(String(url));
    headers = new Headers(init?.headers);
    if (seen.length === 1) return Response.json({ servers: [entry('io.github.example/filesystem')], metadata: { nextCursor: 'c/1' } });
    return Response.json({ servers: [entry('io.github.example/second')], metadata: {} });
  };
  const source = pulseSource({ fetch: fetchImpl, headers: { 'x-api-key': 'k', 'x-tenant-id': 't' } });
  const servers = await source.fetch();
  expect(source.origin).toBe('pulsemcp');
  expect(servers.map((server) => server.name)).toEqual(['io.github.example/filesystem', 'io.github.example/second']);
  expect(seen).toEqual([pulseUrl(), pulseUrl('c/1')]);
  expect(seen[1]).toContain('cursor=c%2F1');
  expect(seen[0]).toContain('version=latest');
  expect(headers.get('x-api-key')).toBe('k');
  expect(headers.get('x-tenant-id')).toBe('t');
});
