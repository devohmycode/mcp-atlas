import { expect, it } from 'vitest';
import { dedupe } from '../src/dedupe.js';
import type { RawServer } from '../src/types.js';

const npm = {
  registryType: 'npm',
  identifier: '@example/filesystem',
  version: '1.0.0',
  transport: 'stdio' as const,
};

const official: RawServer = {
  origin: 'official',
  name: 'io.github.example/filesystem',
  title: 'FS',
  description: 'short',
  version: '1.0.0',
  repository: { url: 'https://github.com/example/filesystem' },
  packages: [npm],
  remotes: [{ type: 'sse', url: 'https://example.com/sse' }],
};

const glama: RawServer = {
  origin: 'glama',
  name: 'io.github.example/filesystem',
  title: 'Filesystem server',
  description: 'Read and write files on the local machine',
  version: '9.9.9',
  repository: { url: 'https://github.com/other/filesystem' },
  packages: [npm, { registryType: 'pypi', identifier: 'example-filesystem', version: '9.9.9', transport: 'stdio' }],
  remotes: [
    { type: 'sse', url: 'https://example.com/sse' },
    { type: 'streamable-http', url: 'https://glama.example/mcp' },
  ],
};

it('collapses two origins of the same server into one fiche', () => {
  const [server] = dedupe([glama, official]);
  expect(server).toMatchObject({
    id: 'io.github.example/filesystem',
    name: 'io.github.example/filesystem',
    title: 'Filesystem server',
    description: 'Read and write files on the local machine',
    version: '1.0.0',
    repository: { url: 'https://github.com/example/filesystem' },
    origins: ['official', 'glama'],
    themes: [],
    official: false,
    singleRegistry: false,
  });
  expect(server?.packages).toEqual([
    npm,
    { registryType: 'pypi', identifier: 'example-filesystem', version: '9.9.9', transport: 'stdio' },
  ]);
  expect(server?.remotes).toEqual([
    { type: 'sse', url: 'https://example.com/sse' },
    { type: 'streamable-http', url: 'https://glama.example/mcp' },
  ]);
});

it('marks a server seen in one origin as a single registry', () => {
  const [server] = dedupe([glama]);
  expect(server?.origins).toEqual(['glama']);
  expect(server?.singleRegistry).toBe(true);
  expect(server?.official).toBe(false);
});

it('merges two github-only records that name the same repository', () => {
  const servers = dedupe([
    {
      origin: 'glama',
      description: 'short',
      repository: { url: 'https://github.com/example/filesystem' },
    },
    {
      origin: 'mcp.so',
      description: 'a longer description of the same repository',
      repository: { url: 'https://github.com/example/filesystem.git' },
    },
  ]);
  expect(servers).toHaveLength(1);
  expect(servers[0]).toMatchObject({
    id: 'github:example/filesystem',
    description: 'a longer description of the same repository',
    origins: ['glama', 'mcp.so'],
    singleRegistry: false,
    official: false,
  });
});

it('skips a record chooseId cannot identify', () => {
  const servers = dedupe([
    { origin: 'smithery', name: 'brave', repository: { url: 'https://brave.com' } },
    glama,
  ]);
  expect(servers.map((server) => server.id)).toEqual(['io.github.example/filesystem']);
});
