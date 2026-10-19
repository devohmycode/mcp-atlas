import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { clientConfigPath } from '../src/clients.js';
import { createHandler } from '../src/mcp.js';
import { catalog, filesystem, loose } from './fixture.js';

it('does not execute a catalog server', () => {
  const source = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf8');
  expect(source).not.toContain('child_process');
  expect(source).not.toContain('spawn(');
});

it('searches, shows, and installs only when a high risk is explicitly accepted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-mcp-'));
  const cursor = clientConfigPath('cursor', 'user', { platform: process.platform, home: dir, projectRoot: dir, env: {} });
  const handle = createHandler({
    version: '0.0.0',
    loadCatalog: async () => catalog([filesystem(), loose()]),
    home: dir,
    cwd: dir,
    platform: process.platform,
    env: {},
    config: {},
  });
  try {
    const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(JSON.stringify(init)).toContain('mcp-atlas');
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
    const tools = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const names = JSON.stringify(tools);
    expect(names).toContain('search_servers');
    expect(names).toContain('show_server');
    expect(names).toContain('install_servers');

    const found = await handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'search_servers', arguments: { query: 'files' } },
    });
    expect(JSON.stringify(found)).toContain('com.example/filesystem');

    const shown = await handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'show_server', arguments: { id: 'com.example/loose' } },
    });
    expect(JSON.stringify(shown)).toContain('unpinned');

    const refused = await handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'install_servers', arguments: { ids: ['com.example/loose'], clients: ['cursor'], scope: 'user' } },
    });
    expect(JSON.stringify(refused)).toContain('isError');
    expect(JSON.stringify(refused)).toContain('Audit failed for com.example/loose');
    expect(existsSync(cursor)).toBe(false);

    const accepted = await handle({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'install_servers',
        arguments: { ids: ['com.example/loose'], clients: ['cursor'], scope: 'user', accept_risk: true },
      },
    });
    expect(JSON.stringify(accepted)).not.toContain('isError');
    const written = JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: Record<string, { args: string[] }> };
    expect(written.mcpServers.loose?.args).toContain('-y');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
