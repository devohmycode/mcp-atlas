import { expect, it } from 'vitest';
import { liteCatalog } from '../src/lite.js';
import { catalog, filesystem, loose, server } from './fixture.js';

it('keeps only the fiches with something to install, with matching stats', () => {
  const lite = liteCatalog(catalog([filesystem(), loose(), server({ id: 'com.example/empty', name: 'com.example/empty' })]));
  expect(lite.servers.map((s) => s.id)).toEqual(['com.example/filesystem', 'com.example/loose']);
  expect(lite.stats).toMatchObject({ merged: 2, byTheme: { files: 2 } });
});
