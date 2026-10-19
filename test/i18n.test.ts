import { expect, it } from 'vitest';
import { THEME_IDS } from '../src/taxonomy.js';
import { LANGUAGES, LOCALES, normalizeLang, systemLang } from '../src/i18n/index.js';

it('translates every theme in every language, with a locale', () => {
  for (const [lang, messages] of Object.entries(LANGUAGES)) {
    for (const id of [...THEME_IDS, 'recommended', 'installed']) expect(messages.themes[id], `${lang} ${id}`).toBeTruthy();
    expect(LOCALES[lang as keyof typeof LOCALES]).toBeTruthy();
  }
});

it('reads a language from flags and the system', () => {
  expect(normalizeLang('ja_JP.UTF-8')).toBe('ja');
  expect(normalizeLang('xx')).toBeUndefined();
  expect(systemLang({ LANG: 'ko_KR.UTF-8' })).toBe('ko');
  expect(systemLang({ LANG: 'C' }, 'pt-BR')).toBe('pt');
});
