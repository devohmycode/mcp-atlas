import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { importBundle, exportBundle } from '../src/bundle.js';
import { clientConfigPath } from '../src/clients.js';
import { readInstalled } from '../src/installed.js';
import { catalog, filesystem, loose } from './fixture.js';

const ctx = { platform: 'linux' as const, home: '/home/ada', projectRoot: '/work/app' };

it('exports only ids that matched a fiche', () => {
  const path = '/home/ada/.cursor/mcp.json';
  const text = JSON.stringify({
    mcpServers: {
      filesystem: { command: 'npx', args: ['@example/filesystem@1.2.3'] },
      custom: { command: 'echo', args: ['hi'] },
    },
  });
  const installed = readInstalled({
    catalog: catalog([filesystem()]),
    clients: ['cursor'],
    scope: 'user',
    ctx,
    files: new Map([[path, text]]),
  });
  expect(exportBundle(installed)).toEqual({ mcpAtlas: 1, servers: ['com.example/filesystem'] });
});

it('rejects an id shaped like an option before any file exists', async () => {
  const home = mkdtempSync(join(tmpdir(), 'mcp-atlas-bundle-'));
  const disk = { platform: process.platform, home, projectRoot: home, env: {} };
  try {
    await expect(
      importBundle({
        text: JSON.stringify({ mcpAtlas: 1, servers: ['-y'] }),
        catalog: catalog([filesystem()]),
        clients: ['cursor'],
        scope: 'user',
        ctx: disk,
      }),
    ).rejects.toThrow(/Unusable id "-y"/);
    expect(existsSync(join(home, '.cursor'))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('does not write the earlier id when a later id is unknown', async () => {
  const home = mkdtempSync(join(tmpdir(), 'mcp-atlas-bundle-'));
  const disk = { platform: process.platform, home, projectRoot: home, env: {} };
  try {
    await expect(
      importBundle({
        text: JSON.stringify({ mcpAtlas: 1, servers: ['com.example/filesystem', 'com.example/missing'] }),
        catalog: catalog([filesystem()]),
        clients: ['cursor'],
        scope: 'user',
        ctx: disk,
      }),
    ).rejects.toThrow(/Unknown server com\.example\/missing/);
    expect(existsSync(clientConfigPath('cursor', 'user', disk))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('does not write the earlier id when a later id fails the audit', async () => {
  const home = mkdtempSync(join(tmpdir(), 'mcp-atlas-bundle-'));
  const disk = { platform: process.platform, home, projectRoot: home, env: {} };
  try {
    await expect(
      importBundle({
        text: JSON.stringify({ mcpAtlas: 1, servers: ['com.example/filesystem', 'com.example/loose'] }),
        catalog: catalog([filesystem(), loose()]),
        clients: ['cursor'],
        scope: 'user',
        ctx: disk,
      }),
    ).rejects.toThrow(/Audit failed for com\.example\/loose/);
    expect(existsSync(clientConfigPath('cursor', 'user', disk))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('writes through the install plan', async () => {
  const home = mkdtempSync(join(tmpdir(), 'mcp-atlas-bundle-'));
  const disk = { platform: process.platform, home, projectRoot: home, env: {} };
  const path = clientConfigPath('cursor', 'user', disk);
  try {
    await importBundle({
      text: JSON.stringify({ mcpAtlas: 1, servers: ['com.example/filesystem'] }),
      catalog: catalog([filesystem()]),
      clients: ['cursor'],
      scope: 'user',
      ctx: disk,
    });
    const written = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers: Record<string, { command: string; args: string[] }> };
    expect(written.mcpServers.filesystem).toEqual({ command: 'npx', args: ['@example/filesystem@1.2.3'] });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
