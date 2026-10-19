import { expect, it } from 'vitest';
import { dedupe } from '../src/dedupe.js';
import { markOfficial } from '../src/mark.js';
import type { RawServer } from '../src/types.js';

function marked(raw: RawServer[]): boolean {
  const [server] = markOfficial(dedupe(raw), raw);
  if (!server) throw new Error('expected a fiche');
  return server.official;
}

it('marks a fiche official when the registry record is active', () => {
  expect(
    marked([
      {
        origin: 'official',
        name: 'com.example/filesystem',
        status: 'active',
        description: 'Files',
        repository: { url: 'https://github.com/example/filesystem' },
      },
    ]),
  ).toBe(true);
});

it('does not mark a deprecated registry record', () => {
  expect(
    marked([
      {
        origin: 'official',
        name: 'com.example/old',
        status: 'deprecated',
        description: 'Old',
        repository: { url: 'https://github.com/example/old' },
      },
    ]),
  ).toBe(false);
});

it('marks a vendor repository listed in the repo', () => {
  expect(
    marked([
      {
        origin: 'glama',
        name: 'filesystem',
        description: 'Reference servers',
        repository: { url: 'https://github.com/modelcontextprotocol/servers.git' },
      },
    ]),
  ).toBe(true);
});

it('leaves a community fiche unmarked', () => {
  expect(
    marked([
      {
        origin: 'glama',
        name: 'notes',
        description: 'A community server',
        repository: { url: 'https://github.com/example/notes' },
      },
    ]),
  ).toBe(false);
});
