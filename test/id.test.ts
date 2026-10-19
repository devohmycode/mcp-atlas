import { expect, it } from 'vitest';
import { chooseId, formatId, IdError, parseId } from '../src/id.js';

it('lets a reverse-DNS registry name win over a GitHub repository', () => {
  expect(
    chooseId({
      name: 'io.github.example/filesystem',
      repositoryUrl: 'https://github.com/other/filesystem.git',
    }),
  ).toBe('io.github.example/filesystem');
});

it('uses github:owner/repo when there is no reverse-DNS name', () => {
  expect(chooseId({ name: 'filesystem', repositoryUrl: 'https://github.com/example/filesystem.git' })).toBe(
    'github:example/filesystem',
  );
  expect(chooseId({ repositoryUrl: 'git@github.com:example/filesystem.git' })).toBe('github:example/filesystem');
});

it('rejects an empty id, an id with a space, and an id that looks like an option', () => {
  for (const id of ['', ' ', 'io.github.example/my server', '-y', '--help']) {
    expect(() => parseId(id), id).toThrow(IdError);
  }
  expect(() => chooseId({})).toThrow(IdError);
  expect(() => parseId('github:-y/repo')).toThrow(IdError);
});

it('parses and formats an id back to itself', () => {
  for (const id of ['io.github.example/filesystem', 'com.example/search', 'github:example/filesystem']) {
    expect(formatId(parseId(id))).toBe(id);
  }
});
