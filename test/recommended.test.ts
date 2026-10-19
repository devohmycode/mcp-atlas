import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { applyRecommended, bundledRecommendedPath, readRecommended } from '../src/recommended.js';
import { catalog, filesystem } from './fixture.js';

it('ships an empty recommendation list', () => {
  const text = readFileSync(new URL('../data/recommended.json', import.meta.url), 'utf8');
  expect(JSON.parse(text)).toEqual({ servers: [] });
  expect(readRecommended({ userPath: join(tmpdir(), 'mcp-atlas-missing-recommended.json'), bundledPath: bundledRecommendedPath() })).toEqual([]);
});

it('lets the user file replace the bundled list, including when it is empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-recommended-'));
  const user = join(dir, 'user.json');
  const bundled = join(dir, 'bundled.json');
  writeFileSync(bundled, JSON.stringify({ servers: [{ id: 'com.example/filesystem' }] }));
  writeFileSync(user, JSON.stringify({ servers: [] }));
  try {
    expect(readRecommended({ userPath: user, bundledPath: bundled })).toEqual([]);
    const applied = applyRecommended(catalog([filesystem()]), readRecommended({ userPath: user, bundledPath: bundled }));
    expect(applied.missing).toEqual([]);
    expect(applied.catalog.themes.some((theme) => theme.id === 'recommended')).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds a section for known ids and reports an id that is not in the catalog', () => {
  const applied = applyRecommended(catalog([filesystem()]), [
    { id: 'com.example/filesystem', reason: 'daily' },
    { id: 'com.example/missing' },
  ]);
  expect(applied.missing).toEqual(['com.example/missing']);
  expect(applied.catalog.themes[0]?.id).toBe('recommended');
  expect(applied.catalog.servers[0]?.themes[0]).toBe('recommended');
  expect(applied.catalog.stats.byTheme.recommended).toBe(1);
  expect(applied.catalog.servers.some((item) => item.id === 'com.example/missing')).toBe(false);
});
