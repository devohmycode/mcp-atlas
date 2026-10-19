import { expect, it } from 'vitest';
import type { ProposedCommand } from '../src/command.js';
import { assessRisks } from '../src/risk.js';

const pinnedNpm: ProposedCommand = {
  kind: 'stdio',
  runtime: 'npm',
  command: 'npx',
  args: ['@example/filesystem@1.2.3'],
  unpinned: false,
};

const docker: ProposedCommand = {
  kind: 'stdio',
  runtime: 'docker',
  command: 'docker',
  args: ['run', '-i', '--rm', 'mcp/filesystem:1.2.3'],
  unpinned: false,
};

it('flags a download piped to a shell as high', () => {
  expect(assessRisks({ text: 'curl|sh' })).toContainEqual({
    level: 'high',
    code: 'pipe-to-shell',
    detail: 'Command downloads and executes a script (curl|sh)',
  });
});

it('flags an unpinned npx -y as high and not as info', () => {
  const risks = assessRisks({
    command: { kind: 'stdio', runtime: 'npm', command: 'npx', args: ['-y', '@example/filesystem'], unpinned: true },
  });
  expect(risks).toEqual([{ level: 'high', code: 'unpinned', detail: 'npx -y or uvx without a version' }]);
});

it('flags an unpinned uvx as high', () => {
  const risks = assessRisks({
    command: { kind: 'stdio', runtime: 'pypi', command: 'uvx', args: ['example-filesystem'], unpinned: true },
  });
  expect(risks.map((risk) => risk.level + ':' + risk.code)).toEqual(['high:unpinned']);
});

it('flags a secret path in a variable value as high', () => {
  const risks = assessRisks({
    command: pinnedNpm,
    variables: [{ name: 'CONFIG', value: '~/.aws/credentials' }],
  });
  expect(risks.map((risk) => risk.code)).toEqual(['secret-path', 'pinned']);
});

it('flags a remote host that is neither the repository nor a registry', () => {
  const risks = assessRisks({
    command: { kind: 'remote', transport: 'streamable-http', url: 'https://evil.example/mcp', unpinned: false },
    repositoryUrl: 'https://github.com/example/app',
  });
  expect(risks).toEqual([
    {
      level: 'high',
      code: 'foreign-url',
      detail: 'Remote host evil.example is neither the repository nor a registry',
    },
  ]);
});

it('allows a remote on the repository host or a registry host', () => {
  const onRepo = assessRisks({
    command: { kind: 'remote', transport: 'sse', url: 'https://github.com/example/app/mcp', unpinned: false },
    repositoryUrl: 'https://www.github.com/example/app',
  });
  const onRegistry = assessRisks({
    command: {
      kind: 'remote',
      transport: 'streamable-http',
      url: 'https://registry.modelcontextprotocol.io/mcp',
      unpinned: false,
    },
    repositoryUrl: 'https://github.com/example/app',
  });
  expect(onRepo).toEqual([]);
  expect(onRegistry).toEqual([]);
});

it('flags a credential-shaped variable name as medium', () => {
  const risks = assessRisks({
    command: pinnedNpm,
    variables: [
      { name: 'API_TOKEN', value: 'x' },
      { name: 'REGION', value: 'TOKEN' },
    ],
  });
  expect(risks).toEqual([
    { level: 'medium', code: 'sensitive-name', detail: 'Variable API_TOKEN contains TOKEN' },
    { level: 'info', code: 'pinned', detail: 'Pinned package' },
  ]);
});

it('marks a pinned package as info', () => {
  expect(assessRisks({ command: pinnedNpm })).toEqual([{ level: 'info', code: 'pinned', detail: 'Pinned package' }]);
});

it('marks a Docker image as info', () => {
  expect(assessRisks({ command: docker })).toEqual([{ level: 'info', code: 'image', detail: 'Docker image' }]);
});
