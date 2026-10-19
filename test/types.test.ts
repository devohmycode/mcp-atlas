import { expect, it } from 'vitest';
import type { Catalog, RawServer, Server } from '../src/types.js';

const raw = {
  origin: 'official',
  name: 'io.github.example/fs',
} satisfies RawServer;

const server = {
  id: 'io.github.example/fs',
  name: 'io.github.example/fs',
  title: 'Filesystem',
  description: 'Files',
  version: '1.0.0',
  repository: { url: 'https://github.com/example/fs' },
  packages: [{ registryType: 'npm', identifier: '@example/fs', version: '1.0.0', transport: 'stdio' }],
  remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
  origins: ['official'],
  themes: ['files'],
  official: true,
  singleRegistry: false,
} satisfies Server;

const catalog = {
  version: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  themes: [{ id: 'files', label: 'Files' }],
  servers: [server],
  stats: {
    raw: { official: 1 },
    sources: { official: { status: 'ok', count: 1 } },
    merged: 1,
    official: 1,
    singleRegistry: 0,
    byTheme: { files: 1 },
  },
} satisfies Catalog;

it('builds a version 1 catalog entry', () => {
  expect(catalog.version).toBe(1);
  expect(server.packages[0]?.transport).toBe('stdio');
  expect(server.remotes[0]?.type).toBe('streamable-http');
  expect(raw.origin).toBe('official');
});
