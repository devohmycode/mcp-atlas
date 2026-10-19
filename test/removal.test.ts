import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { expect, it } from 'vitest';
import { applyRemoval } from '../src/apply.js';

const stdio = { command: 'npx', args: ['@example/filesystem@1.2.3'] };

it('removes a JSON key, keeps the rest, and saves a backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-remove-'));
  const path = join(dir, 'mcp.json');
  const original = `${JSON.stringify({ theme: 'dark', mcpServers: { filesystem: stdio, other: { command: 'uvx', args: ['other'] } } }, null, 2)}\n`;
  writeFileSync(path, original);
  try {
    const result = await applyRemoval({ path, format: 'json', key: 'filesystem' });
    expect(result).toMatchObject({ written: true, dryRun: false });
    expect(readFileSync(`${path}.bak`, 'utf8')).toBe(original);
    expect(existsSync(`${path}.tmp`)).toBe(false);
    const written = JSON.parse(readFileSync(path, 'utf8')) as { theme: string; mcpServers: Record<string, unknown> };
    expect(written.theme).toBe('dark');
    expect(written.mcpServers.other).toEqual({ command: 'uvx', args: ['other'] });
    expect(written.mcpServers.filesystem).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('removes a TOML table and keeps the other keys', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-remove-'));
  const path = join(dir, 'config.toml');
  const original = 'model = "gpt"\n\n[mcp_servers.filesystem]\ncommand = "npx"\nargs = ["@example/filesystem@1.2.3"]\n\n[mcp_servers.other]\ncommand = "uvx"\nargs = ["other"]\n';
  writeFileSync(path, original);
  try {
    await applyRemoval({ path, format: 'toml', key: 'filesystem' });
    expect(readFileSync(`${path}.bak`, 'utf8')).toBe(original);
    expect(existsSync(`${path}.tmp`)).toBe(false);
    const written = parse(readFileSync(path, 'utf8')) as { model: string; mcp_servers: Record<string, { command?: string }> };
    expect(written.model).toBe('gpt');
    expect(written.mcp_servers.other?.command).toBe('uvx');
    expect(written.mcp_servers.filesystem).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('keeps an empty server map when the last key is removed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-remove-'));
  const path = join(dir, 'mcp.json');
  writeFileSync(path, `${JSON.stringify({ mcpServers: { filesystem: stdio } }, null, 2)}\n`);
  try {
    await applyRemoval({ path, format: 'json', key: 'filesystem' });
    const written = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers: Record<string, unknown> };
    expect(written.mcpServers).toEqual({});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('prints a dry-run of a present key and writes nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-remove-'));
  const path = join(dir, 'mcp.json');
  const original = `${JSON.stringify({ theme: 'dark', mcpServers: { filesystem: stdio, other: { command: 'uvx', args: ['other'] } } }, null, 2)}\n`;
  writeFileSync(path, original);
  const logs: string[] = [];
  try {
    const result = await applyRemoval({ path, format: 'json', key: 'filesystem' }, { dryRun: true, log: (line) => logs.push(line) });
    expect(result).toMatchObject({ written: false, dryRun: true });
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(existsSync(`${path}.bak`)).toBe(false);
    expect(existsSync(`${path}.tmp`)).toBe(false);
    expect(logs[0]).toBe(`dry-run ${path}`);
    const body = JSON.parse(logs.slice(1).join('\n')) as { theme: string; mcpServers: Record<string, unknown> };
    expect(body.theme).toBe('dark');
    expect(body.mcpServers.other).toEqual({ command: 'uvx', args: ['other'] });
    expect(body.mcpServers.filesystem).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('prints a dry-run and creates no directory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-remove-'));
  const path = join(dir, 'missing', 'mcp.json');
  const logs: string[] = [];
  try {
    const result = await applyRemoval({ path, format: 'json', key: 'filesystem' }, { dryRun: true, log: (line) => logs.push(line) });
    expect(result).toMatchObject({ written: false, dryRun: true });
    expect(existsSync(join(dir, 'missing'))).toBe(false);
    expect(logs.some((line) => line.startsWith('skip '))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('does not write or back up a missing key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-remove-'));
  const path = join(dir, 'mcp.json');
  const original = `${JSON.stringify({ mcpServers: { other: { command: 'uvx', args: ['other'] } } })}\n`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, original);
  try {
    const result = await applyRemoval({ path, format: 'json', key: 'filesystem' });
    expect(result.written).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(existsSync(`${path}.bak`)).toBe(false);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
