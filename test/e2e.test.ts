import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { expect, it } from 'vitest';
import { clientConfigPath } from '../src/clients.js';
import { catalog, filesystem } from './fixture.js';
import { runCli } from './run.js';

it('loads a fixture catalog, searches, shows, dry-runs, writes, rereads, and uninstalls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-e2e-'));
  const ctx = { platform: process.platform, home: dir, projectRoot: dir, env: {} };
  const cursor = clientConfigPath('cursor', 'user', ctx);
  const grok = clientConfigPath('grok', 'user', ctx);
  const books = catalog([filesystem()]);
  const deps = {
    loadCatalog: async () => books,
    home: dir,
    cwd: dir,
    platform: process.platform,
    env: {},
    readConfig: () => ({}),
    writeConfig: () => {},
    packs: () => [],
    interactive: false,
    fetch: async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (!url.includes('raw.githubusercontent.com')) throw new Error(`unexpected fetch ${url}`);
      return new Response('# Filesystem readme\n');
    },
  };
  try {
    const listed = await runCli(['list', '-q', 'filesystem', '--json'], deps);
    expect(listed.code).toBe(0);
    expect(listed.stdout).toContain('com.example/filesystem');

    const shown = await runCli(['show', 'com.example/filesystem', '--json'], deps);
    expect(shown.code).toBe(0);
    const fiche = JSON.parse(shown.stdout) as { id: string; readme: string };
    expect(fiche.id).toBe('com.example/filesystem');
    expect(fiche.readme).toContain('Filesystem readme');

    expect(existsSync(cursor)).toBe(false);
    const dry = await runCli(['install', 'com.example/filesystem', '-a', 'cursor', '-g', '--dry-run'], deps);
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain('dry-run');
    expect(existsSync(cursor)).toBe(false);

    expect((await runCli(['install', 'com.example/filesystem', '-a', 'cursor', '-g'], deps)).code).toBe(0);
    expect((await runCli(['install', 'com.example/filesystem', '-a', 'grok', '-g'], deps)).code).toBe(0);
    const json = JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: Record<string, { command: string }> };
    expect(json.mcpServers.filesystem?.command).toBe('npx');
    const toml = parse(readFileSync(grok, 'utf8')) as { mcp_servers: Record<string, { command?: string }> };
    expect(toml.mcp_servers.filesystem?.command).toBe('npx');

    const installed = await runCli(['installed', '-g', '--json'], deps);
    expect(installed.stdout).toContain('com.example/filesystem');

    expect((await runCli(['uninstall', 'com.example/filesystem', '-a', 'cursor,grok', '-g'], deps)).code).toBe(0);
    const cleared = JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: Record<string, unknown> };
    expect(cleared.mcpServers.filesystem).toBeUndefined();
    const clearedToml = parse(readFileSync(grok, 'utf8')) as { mcp_servers: Record<string, unknown> };
    expect(clearedToml.mcp_servers.filesystem).toBeUndefined();
    expect(existsSync(`${cursor}.tmp`)).toBe(false);
    expect(existsSync(`${grok}.tmp`)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  expect(existsSync(dir)).toBe(false);
});
