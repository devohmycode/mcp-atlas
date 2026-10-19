import type { Theme } from './types.js';

/** Closed list. Classification may only emit these ids. */
export const THEME_IDS = [
  'files',
  'git',
  'databases',
  'browsers',
  'search',
  'memory',
  'design',
  'productivity',
  'other',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEMES: readonly Theme[] = [
  { id: 'files', label: 'Files' },
  { id: 'git', label: 'Git repositories' },
  { id: 'databases', label: 'Databases' },
  { id: 'browsers', label: 'Browsers' },
  { id: 'search', label: 'Search' },
  { id: 'memory', label: 'Memory' },
  { id: 'design', label: 'Design' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'other', label: 'Other' },
];
