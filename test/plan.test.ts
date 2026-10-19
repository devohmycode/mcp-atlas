import { expect, it } from 'vitest';
import { PlanError, planInstall, type PlanInput } from '../src/plan.js';
import type { Server } from '../src/types.js';

const ctx = { platform: 'linux' as const, home: '/home/ada', projectRoot: '/work/app' };

function fiche(partial: Partial<Server> & Pick<Server, 'packages' | 'remotes'>): PlanInput['server'] {
  return {
    id: 'io.github.example/filesystem',
    name: 'io.github.example/filesystem',
    version: '1.2.3',
    repository: { url: 'https://github.com/example/filesystem' },
    ...partial,
  };
}

const pinned = fiche({
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' }],
  remotes: [],
});

const unpinned = fiche({
  version: undefined,
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', transport: 'stdio' }],
  remotes: [],
});

function base(server: PlanInput['server'], extra: Partial<PlanInput> = {}): PlanInput {
  return { server, clients: ['cursor'], scope: 'user', ctx, ...extra };
}

it('plans a JSON entry and keeps the other keys', () => {
  const path = '/home/ada/.cursor/mcp.json';
  const plans = planInstall(
    base(pinned, {
      env: { LOG: '1' },
      files: new Map([
        [
          path,
          JSON.stringify({
            theme: 'dark',
            mcpServers: {
              filesystem: { command: 'npx', args: ['old'] },
              other: { command: 'uvx', args: ['other'] },
            },
          }),
        ],
      ]),
    }),
  );
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({
    clients: ['cursor'],
    path,
    format: 'json',
    key: 'filesystem',
    entry: { command: 'npx', args: ['@example/filesystem@1.2.3'], env: { LOG: '1' } },
    collision: { command: 'npx', args: ['old'] },
  });
  expect(plans[0]?.untouched).toEqual([
    { key: 'theme', value: 'dark' },
    { key: 'mcpServers.other', value: { command: 'uvx', args: ['other'] } },
  ]);
});

it('plans one TOML table and keeps the other keys', () => {
  const path = '/home/ada/.grok/config.toml';
  const plans = planInstall({
    server: fiche({
      id: 'com.example/search',
      name: 'com.example/search',
      packages: [],
      remotes: [{ type: 'streamable-http', url: 'https://registry.modelcontextprotocol.io/mcp' }],
    }),
    clients: ['grok'],
    scope: 'user',
    ctx,
    files: new Map([
      [
        path,
        [
          'model = "grok"',
          '',
          '[mcp_servers.search]',
          'url = "https://old.example/mcp"',
          '',
          '[mcp_servers.other]',
          'command = "npx"',
          'args = ["other"]',
          '',
        ].join('\n'),
      ],
    ]),
  });
  expect(plans).toEqual([
    expect.objectContaining({
      clients: ['grok'],
      path,
      format: 'toml',
      key: 'search',
      table: 'mcp_servers.search',
      entry: { url: 'https://registry.modelcontextprotocol.io/mcp' },
      collision: { url: 'https://old.example/mcp' },
      untouched: [
        { key: 'model', value: 'grok' },
        { key: 'mcp_servers.other', value: { command: 'npx', args: ['other'] } },
      ],
    }),
  ]);
});

it('writes Codex CLI and Codex desktop once', () => {
  const plans = planInstall({
    server: pinned,
    clients: ['codex-desktop', 'grok', 'codex-cli'],
    scope: 'user',
    ctx,
  });
  expect(plans.map((plan) => plan.clients)).toEqual([['codex-desktop', 'codex-cli'], ['grok']]);
  expect(plans.map((plan) => plan.path)).toEqual(['/home/ada/.codex/config.toml', '/home/ada/.grok/config.toml']);
  expect(plans[0]).toMatchObject({ format: 'toml', table: 'mcp_servers.filesystem', collision: undefined, untouched: [] });
});

it('returns no plan when the audit fails, unless the audit is off', () => {
  expect(() => planInstall(base(unpinned))).toThrow(PlanError);
  expect(() => planInstall(base(unpinned))).toThrow(/Audit failed/);
  const once = planInstall(base(unpinned, { enabled: false }));
  const saved = planInstall(base(unpinned, { config: { audit: false } }));
  expect(once[0]?.entry).toEqual({ command: 'npx', args: ['-y', '@example/filesystem'] });
  expect(saved[0]?.entry).toEqual({ command: 'npx', args: ['-y', '@example/filesystem'] });
});
