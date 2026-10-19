import { expect, it } from 'vitest';
import { readInstalled } from '../src/installed.js';
import type { Catalog, ClientId, Server } from '../src/types.js';

const ctx = { platform: 'linux' as const, home: '/home/ada', projectRoot: '/work/app' };

function server(partial: Partial<Server> & Pick<Server, 'id' | 'packages' | 'remotes'>): Server {
  return {
    name: partial.id,
    origins: ['official'],
    themes: [],
    official: true,
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

const filesystem = server({
  id: 'com.example/filesystem',
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' }],
  remotes: [],
});
const search = server({
  id: 'com.example/search',
  name: 'com.example/search',
  packages: [],
  remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
});
const empty = server({ id: 'com.example/empty', packages: [], remotes: [] });
const same = server({
  id: 'com.example/same',
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' }],
  remotes: [],
});

function read(clients: ClientId[], files: Map<string, string>, servers: Server[] = [filesystem, search]) {
  return readInstalled({ catalog: catalog(servers), clients, scope: 'user', ctx, files });
}

it('counts the shared Codex file once and lists an unknown entry apart', () => {
  const path = '/home/ada/.codex/config.toml';
  const text = [
    '[mcp_servers.filesystem]',
    'command = "npx"',
    'args = ["@example/filesystem@1.2.3"]',
    '',
    '[mcp_servers.custom]',
    'command = "echo"',
    'args = ["hi"]',
    '',
  ].join('\n');
  const result = read(['codex-desktop', 'codex-cli', 'claude-desktop'], new Map([[path, text]]));
  expect(result.matches).toEqual([
    { id: 'com.example/filesystem', key: 'filesystem', path, clients: ['codex-desktop', 'codex-cli'] },
  ]);
  expect(result.unknown).toEqual([{ key: 'custom', path, clients: ['codex-desktop', 'codex-cli'] }]);
});

it('matches a URL and ignores env, and argument order matters', () => {
  const path = '/home/ada/.cursor/mcp.json';
  const image = server({
    id: 'com.example/image',
    packages: [{ registryType: 'docker', identifier: 'example/filesystem', version: '1.2.3', transport: 'stdio' }],
    remotes: [],
  });
  const text = JSON.stringify({
    mcpServers: {
      search: { url: 'https://example.com/mcp', env: { TOKEN: 'secret' } },
      filesystem: { command: 'npx', args: ['@example/filesystem@1.2.3'], env: { TOKEN: 'secret' } },
      image: { command: 'docker', args: ['example/filesystem:1.2.3', '--rm', '-i', 'run'] },
    },
  });
  const result = read(['cursor'], new Map([[path, text]]), [filesystem, search, image]);
  expect(result.matches.map((item) => item.id)).toEqual(['com.example/search', 'com.example/filesystem']);
  expect(result.unknown.map((item) => item.key)).toEqual(['image']);
});

it('uses the first catalog fiche and skips a fiche with no command', () => {
  const path = '/home/ada/.cursor/mcp.json';
  const text = JSON.stringify({
    mcpServers: { filesystem: { command: 'npx', args: ['@example/filesystem@1.2.3'] } },
  });
  const result = read(['cursor'], new Map([[path, text]]), [empty, filesystem, same]);
  expect(result.matches.map((item) => item.id)).toEqual(['com.example/filesystem']);
  expect(result.unknown).toEqual([]);
});

it('treats a missing file as empty', () => {
  expect(read(['claude-desktop'], new Map())).toEqual({ matches: [], unknown: [] });
});
