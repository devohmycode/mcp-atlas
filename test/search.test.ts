import { expect, it } from 'vitest';
import { searchCatalog } from '../src/search.js';
import type { Catalog, Server } from '../src/types.js';

function server(partial: Partial<Server> & Pick<Server, 'id'>): Server {
  return {
    name: partial.id,
    packages: [],
    remotes: [],
    origins: ['glama'],
    themes: [],
    official: false,
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

const files = server({
  id: 'com.example/filesystem',
  name: 'Filesystem',
  title: 'Files',
  description: 'Read and write files',
  themes: ['files'],
  official: true,
  origins: ['official', 'glama'],
  singleRegistry: false,
});
const alpha = server({
  id: 'com.example/alpha',
  name: 'Alpha',
  description: 'Notes',
  themes: ['memory'],
  official: true,
  origins: ['official'],
});
const middle = server({
  id: 'github:example/middle',
  name: 'Middle',
  title: 'Search helper',
  description: 'Finds pages',
  themes: ['search'],
  origins: ['glama', 'smithery'],
  singleRegistry: false,
});
const notes = server({
  id: 'com.example/notes',
  name: 'Notes',
  description: 'A notebook',
  themes: ['files'],
});
const snap = catalog([alpha, middle, files, notes]);

it('matches every word in the name, title, description, or id', () => {
  expect(searchCatalog(snap, { query: 'WRITE Files' }).map((item) => item.id)).toEqual(['com.example/filesystem']);
  expect(searchCatalog(snap, { query: 'github:example' }).map((item) => item.id)).toEqual(['github:example/middle']);
  expect(searchCatalog(snap, { query: 'helper' }).map((item) => item.id)).toEqual(['github:example/middle']);
  expect(searchCatalog(snap, { query: 'write missing' })).toEqual([]);
  expect(searchCatalog(snap, { query: 'files' }).map((item) => item.id)).toEqual(['com.example/filesystem']);
});

it('filters by theme and by official', () => {
  expect(searchCatalog(snap, { theme: 'files' }).map((item) => item.id)).toEqual([
    'com.example/filesystem',
    'com.example/notes',
  ]);
  expect(searchCatalog(snap, { theme: 'git' })).toEqual([]);
  expect(searchCatalog(snap, { official: true }).map((item) => item.id)).toEqual([
    'com.example/filesystem',
    'com.example/alpha',
  ]);
});

it('puts official fiches from several directories first', () => {
  expect(searchCatalog(snap).map((item) => item.id)).toEqual([
    'com.example/filesystem',
    'com.example/alpha',
    'com.example/notes',
    'github:example/middle',
  ]);
});

it('accepts --all and does not change the order', () => {
  expect(searchCatalog(snap, { all: true }).map((item) => item.id)).toEqual(searchCatalog(snap).map((item) => item.id));
});
