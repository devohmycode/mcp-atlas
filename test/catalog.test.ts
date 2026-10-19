import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { buildCatalog } from '../src/build.js';
import { CatalogShapeError, defaultCatalogPath, loadCatalog, saveCatalog } from '../src/catalog.js';
import type { Catalog, RawServer } from '../src/types.js';

const filesystem: RawServer = {
  origin: 'official',
  name: 'com.example/filesystem',
  status: 'active',
  description: 'Read and write files',
  version: '1.0.0',
  repository: { url: 'https://github.com/example/filesystem' },
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.0.0', transport: 'stdio' }],
};

async function sample(): Promise<Catalog> {
  return buildCatalog({
    sources: [{ origin: 'official', fetch: async () => [filesystem] }],
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
}

it('writes a gzip snapshot and reads it back with generatedAt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-'));
  const path = join(dir, 'catalog.json.gz');
  try {
    const catalog = await sample();
    await saveCatalog(catalog, path);
    const bytes = readFileSync(path);
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
    const loaded = await loadCatalog(path);
    expect(loaded.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(loaded.servers.map((server) => server.id)).toEqual(['com.example/filesystem']);
    expect(loaded.stats.merged).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('names the field when the snapshot shape is old', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-'));
  const path = join(dir, 'catalog.json.gz');
  try {
    const catalog = await sample();
    const stale = { ...catalog, generatedAt: undefined };
    writeFileSync(path, gzipSync(Buffer.from(JSON.stringify(stale))));
    await expect(loadCatalog(path)).rejects.toBeInstanceOf(CatalogShapeError);
    await expect(loadCatalog(path)).rejects.toMatchObject({ field: 'generatedAt' });

    const broken = structuredClone(catalog);
    const server = broken.servers[0] as { name?: string } | undefined;
    if (!server) throw new Error('missing server');
    delete server.name;
    writeFileSync(path, gzipSync(Buffer.from(JSON.stringify(broken))));
    await expect(loadCatalog(path)).rejects.toMatchObject({ field: 'servers.0.name' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('names a truncated snapshot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-'));
  const path = join(dir, 'catalog.json.gz');
  try {
    const catalog = await sample();
    const full = gzipSync(Buffer.from(JSON.stringify(catalog)));
    writeFileSync(path, full.subarray(0, 12));
    await expect(loadCatalog(path)).rejects.toMatchObject({ field: 'catalog', message: expect.stringMatching(/truncated/) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('points the default snapshot at data/catalog.json.gz', () => {
  expect(defaultCatalogPath().replaceAll('\\', '/')).toMatch(/data\/catalog\.json\.gz$/);
});
