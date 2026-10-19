import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { expect, it } from 'vitest';
import { applyPlan } from '../src/apply.js';
import type { FilePlan } from '../src/plan.js';

function plan(path: string, format: 'json' | 'toml', entry: FilePlan['entry'], key = 'filesystem'): FilePlan {
  return {
    clients: [format === 'json' ? 'cursor' : 'grok'],
    path,
    format,
    key,
    table: format === 'toml' ? `mcp_servers.${key}` : undefined,
    entry,
    untouched: [],
  };
}

const stdio = { command: 'npx', args: ['@example/filesystem@1.2.3'], env: { LOG: '1' } };

it('writes JSON atomically, keeps the other keys, and saves a backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-apply-'));
  const path = join(dir, 'mcp.json');
  const original = `${JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'uvx', args: ['other'] } } }, null, 2)}\n`;
  writeFileSync(path, original);
  try {
    const result = await applyPlan(plan(path, 'json', stdio));
    expect(result).toMatchObject({ written: true, collision: false, dryRun: false });
    expect(readFileSync(`${path}.bak`, 'utf8')).toBe(original);
    expect(existsSync(`${path}.tmp`)).toBe(false);
    const written = JSON.parse(readFileSync(path, 'utf8')) as {
      theme: string;
      mcpServers: Record<string, unknown>;
    };
    expect(written.theme).toBe('dark');
    expect(written.mcpServers.other).toEqual({ command: 'uvx', args: ['other'] });
    expect(written.mcpServers.filesystem).toEqual(stdio);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('writes a TOML table and keeps the other keys', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-apply-'));
  const path = join(dir, 'config.toml');
  const original = 'model = "gpt"\n\n[mcp_servers.other]\ncommand = "uvx"\nargs = ["other"]\n';
  writeFileSync(path, original);
  try {
    await applyPlan(plan(path, 'toml', { url: 'https://registry.modelcontextprotocol.io/mcp' }, 'search'));
    expect(readFileSync(`${path}.bak`, 'utf8')).toBe(original);
    expect(existsSync(`${path}.tmp`)).toBe(false);
    const written = parse(readFileSync(path, 'utf8')) as {
      model: string;
      mcp_servers: Record<string, { command?: string; url?: string }>;
    };
    expect(written.model).toBe('gpt');
    expect(written.mcp_servers.other?.command).toBe('uvx');
    expect(written.mcp_servers.search?.url).toBe('https://registry.modelcontextprotocol.io/mcp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('creates a missing directory and leaves no temporary file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-apply-'));
  const path = join(dir, 'nested', 'mcp.json');
  try {
    expect(existsSync(join(dir, 'nested'))).toBe(false);
    await applyPlan(plan(path, 'json', stdio));
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.bak`)).toBe(false);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('skips a key that already exists and does not back it up', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-apply-'));
  const path = join(dir, 'mcp.json');
  const original = `${JSON.stringify({ mcpServers: { filesystem: { command: 'npx', args: ['old'] } } })}\n`;
  writeFileSync(path, original);
  const logs: string[] = [];
  try {
    const result = await applyPlan(plan(path, 'json', stdio), { log: (line) => logs.push(line) });
    expect(result).toMatchObject({ written: false, collision: true });
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(existsSync(`${path}.bak`)).toBe(false);
    expect(existsSync(`${path}.tmp`)).toBe(false);
    expect(logs[0]).toBe(`skip ${path}: filesystem already exists`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('prints a dry-run and creates no file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-apply-'));
  const path = join(dir, 'missing', 'mcp.json');
  const logs: string[] = [];
  try {
    const result = await applyPlan(plan(path, 'json', stdio), { dryRun: true, log: (line) => logs.push(line) });
    expect(result).toMatchObject({ written: false, collision: false, dryRun: true });
    expect(existsSync(join(dir, 'missing'))).toBe(false);
    expect(existsSync(`${path}.bak`)).toBe(false);
    expect(existsSync(`${path}.tmp`)).toBe(false);
    expect(logs[0]).toBe(`dry-run ${path}`);
    expect(JSON.parse(logs[1] ?? '')).toMatchObject({ mcpServers: { filesystem: stdio } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('removes the temporary file when the replacement fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-apply-'));
  const path = join(dir, 'mcp.json');
  writeFileSync(path, '{}\n');
  mkdirSync(`${path}.bak`);
  try {
    await expect(applyPlan(plan(path, 'json', stdio))).rejects.toThrow();
    expect(existsSync(`${path}.tmp`)).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe('{}\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
