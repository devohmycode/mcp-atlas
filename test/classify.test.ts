import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { classify } from '../src/classify.js';
import { THEME_IDS } from '../src/taxonomy.js';

const known = JSON.parse(readFileSync(new URL('./fixtures/themes.json', import.meta.url), 'utf8')) as {
  name: string;
  description: string;
  themes: string[];
}[];

it('classifies the known servers into the expected theme', () => {
  for (const server of known) {
    const themes = classify(server);
    expect(themes, server.name).toEqual(server.themes);
    expect(themes.length).toBeGreaterThan(0);
    expect(themes.length).toBeLessThanOrEqual(2);
    expect(themes.every((id) => (THEME_IDS as readonly string[]).includes(id))).toBe(true);
  }
});

it('uses a label when the name and description do not match', () => {
  expect(classify({ name: 'scratch', description: 'Nothing recognisable', labels: ['memory'] })).toEqual(['memory']);
});

it('returns two themes with the stronger one first', () => {
  expect(classify({ name: 'filesystem github' })).toEqual(['files', 'git']);
});

it('returns other when nothing matches', () => {
  expect(classify({ name: 'xyzzy', description: 'No matching words' })).toEqual(['other']);
});

it('does not treat the io.github namespace as the git theme', () => {
  expect(classify({ name: 'io.github.example/filesystem', description: 'Read and write files' })).toEqual(['files']);
});
