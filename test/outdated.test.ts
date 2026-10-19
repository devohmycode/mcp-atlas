import { expect, it } from 'vitest';
import { compareVersions, outdatedEntries } from '../src/outdated.js';
import { catalog, filesystem, server } from './fixture.js';

const ctx = { platform: 'linux' as const, home: '/home/ada', projectRoot: '/work/app' };
const path = '/home/ada/.cursor/mcp.json';

function rows(servers: ReturnType<typeof filesystem>[], mcpServers: Record<string, unknown>) {
  return outdatedEntries({
    catalog: catalog(servers),
    clients: ['cursor'],
    scope: 'user',
    ctx,
    files: new Map([[path, JSON.stringify({ mcpServers })]]),
  });
}

it('treats a missing pin as unknown, never up to date', () => {
  expect(compareVersions(undefined, '1.2.3')).toBe('unknown');
  expect(compareVersions('1.2.3', '1.2.3')).toBe('current');
  expect(compareVersions('1.0.0', '1.2.3')).toBe('outdated');
});

it('reports a matching pin as current and a different pin as outdated', () => {
  const current = rows([filesystem()], { filesystem: { command: 'npx', args: ['@example/filesystem@1.2.3'] } });
  expect(current.map((row) => row.status)).toEqual(['current']);
  const drifted = rows([filesystem()], { filesystem: { command: 'npx', args: ['@example/filesystem@1.0.0'] } });
  expect(drifted).toMatchObject([{ id: 'com.example/filesystem', installed: '1.0.0', catalog: '1.2.3', status: 'outdated' }]);
});

it('reports an unpinned config entry and a URL as unknown version', () => {
  const remote = server({
    id: 'com.example/search',
    name: 'com.example/search',
    packages: [],
    remotes: [{ type: 'streamable-http', url: 'https://registry.modelcontextprotocol.io/mcp' }],
  });
  const found = rows([filesystem(), remote], {
    filesystem: { command: 'npx', args: ['-y', '@example/filesystem'] },
    search: { url: 'https://registry.modelcontextprotocol.io/mcp' },
    custom: { command: 'echo', args: ['hi'] },
  });
  expect(found.map((row) => [row.id, row.status])).toEqual([
    ['com.example/search', 'unknown'],
    ['com.example/filesystem', 'unknown'],
  ]);
  expect(found.every((row) => row.status !== 'current')).toBe(true);
});
