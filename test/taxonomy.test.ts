import { expect, it } from 'vitest';
import { THEME_IDS, THEMES, type ThemeId } from '../src/taxonomy.js';

it('exports the closed theme list, including other', () => {
  expect(THEME_IDS).toEqual([
    'files',
    'git',
    'databases',
    'browsers',
    'search',
    'memory',
    'design',
    'productivity',
    'other',
  ]);
  expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length);
  expect(THEMES.map((theme) => theme.id)).toEqual([...THEME_IDS]);
  const ids: ThemeId[] = [...THEME_IDS];
  expect(ids).toContain('other');
});
