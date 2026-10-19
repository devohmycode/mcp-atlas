import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadCatalog } from '../src/catalog.js';
import { CrawlError, crawl, defaultSources } from '../src/crawl.js';
import type { RawServer } from '../src/types.js';

const filesystem: RawServer = {
  origin: 'official',
  name: 'com.example/filesystem',
  status: 'active',
  description: 'Read and write files',
  version: '1.0.0',
  repository: { url: 'https://github.com/example/filesystem' },
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.0.0', transport: 'stdio' }],
};

function work(): { dir: string; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-crawl-'));
  return { dir, out: join(dir, 'catalog.json.gz') };
}

it('writes the snapshot and prints counts, including an empty other source', async () => {
  const { dir, out } = work();
  const lines: string[] = [];
  try {
    await crawl({
      out,
      log: (line) => lines.push(line),
      sources: [
        { origin: 'official', fetch: async () => [filesystem] },
        { origin: 'glama', fetch: async () => [] },
      ],
    });
    expect(lines).toEqual(['official: 1', 'glama: 0', 'merged: 1', 'official fiches: 1']);
    const loaded = await loadCatalog(out);
    expect(loaded.servers.map((server) => server.id)).toEqual(['com.example/filesystem']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('prints another source error and still saves', async () => {
  const { dir, out } = work();
  const lines: string[] = [];
  try {
    await crawl({
      out,
      log: (line) => lines.push(line),
      sources: [
        { origin: 'official', fetch: async () => [filesystem] },
        {
          origin: 'glama',
          fetch: async () => {
            throw new Error('bearer');
          },
        },
      ],
    });
    expect(lines[0]).toBe('official: 1');
    expect(lines[1]).toBe('glama: bearer');
    expect(existsSync(out)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('fails before saving when the official registry returns no fiches', async () => {
  const { dir, out } = work();
  const lines: string[] = [];
  try {
    await expect(
      crawl({
        out,
        log: (line) => lines.push(line),
        sources: [
          { origin: 'official', fetch: async () => [] },
          { origin: 'glama', fetch: async () => [{ ...filesystem, origin: 'glama' }] },
        ],
      }),
    ).rejects.toBeInstanceOf(CrawlError);
    expect(lines).toContain('official: 0');
    expect(lines).toContain('glama: 1');
    expect(existsSync(out)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('fails before saving when the official registry errors', async () => {
  const { dir, out } = work();
  const lines: string[] = [];
  try {
    await expect(
      crawl({
        out,
        log: (line) => lines.push(line),
        sources: [
          {
            origin: 'official',
            fetch: async () => {
              throw new Error('down');
            },
          },
          { origin: 'glama', fetch: async () => [{ ...filesystem, origin: 'glama' }] },
        ],
      }),
    ).rejects.toThrow(/official registry returned zero fiches/i);
    expect(lines[0]).toBe('official: down');
    expect(existsSync(out)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('wires npm run crawl without calling the registries', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    scripts?: { crawl?: string };
  };
  expect(pkg.scripts?.crawl).toBe('tsx src/crawl.ts');
});

it('skips Glama and PulseMCP without their API keys', () => {
  const lines: string[] = [];
  const origins = defaultSources({}, (line) => lines.push(line)).map((source) => source.origin);
  expect(origins).toEqual(['official', 'smithery']);
  expect(lines).toEqual([
    'glama: skipped (set GLAMA_API_KEY)',
    'pulsemcp: skipped (set PULSEMCP_API_KEY and PULSEMCP_TENANT_ID)',
  ]);
});

it('adds Glama and PulseMCP when their keys are set', () => {
  const lines: string[] = [];
  const env = { GLAMA_API_KEY: 'g', PULSEMCP_API_KEY: 'p', PULSEMCP_TENANT_ID: 't' };
  const origins = defaultSources(env, (line) => lines.push(line)).map((source) => source.origin);
  expect(origins).toEqual(['official', 'smithery', 'glama', 'pulsemcp']);
  expect(lines).toEqual([]);
});
