import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { clientConfigPath, type PathContext } from '../src/clients.js';
import { createProgram, type CatalogFlags, type CliDeps } from '../src/cli.js';
import type { UserConfig } from '../src/config.js';
import { catalog, filesystem, loose, server } from './fixture.js';
import { runCli } from './run.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function dirOf(name: string): { dir: string; ctx: PathContext } {
  const dir = mkdtempSync(join(tmpdir(), name));
  dirs.push(dir);
  return { dir, ctx: { platform: process.platform, home: dir, projectRoot: dir, env: {} } };
}

function deps(dir: string, servers = catalog([filesystem(), loose()])): CliDeps {
  return {
    loadCatalog: async () => servers,
    home: dir,
    cwd: dir,
    platform: process.platform,
    env: {},
    readConfig: () => ({}),
    writeConfig: () => {},
    packs: () => [],
    interactive: false,
    newerVersion: () => undefined,
    fetch: async () => new Response('# Hello from the readme\n'),
  };
}

function cursorFile(ctx: PathContext, servers: Record<string, unknown>): string {
  const path = clientConfigPath('cursor', 'user', ctx);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ mcpServers: servers }));
  return path;
}

it('lists the commands of skills-atlas in help', () => {
  const help = createProgram().helpInformation();
  for (const name of ['browse', 'themes', 'list', 'agents', 'show', 'install', 'uninstall', 'installed', 'export', 'import', 'outdated', 'update', 'lock', 'sync', 'packs', 'audit', 'doctor', 'lang', 'ui', 'mcp']) {
    expect(help).toContain(name);
  }
});

it('searches with the list flags', async () => {
  const { dir } = dirOf('mcp-atlas-cli-');
  const extra = server({ id: 'com.example/other', name: 'com.example/other', title: 'Other', official: false, description: 'files too' });
  const result = await runCli(['list', '-q', 'file', '-t', 'files', '--official', '--all', '-n', '5', '--json', '--offline'], {
    ...deps(dir, catalog([filesystem(), extra, loose()])),
    loadCatalog: async (flags: CatalogFlags) => {
      expect(flags.offline).toBe(true);
      return catalog([filesystem(), extra, loose()]);
    },
  });
  expect(result.code).toBe(0);
  const rows = JSON.parse(result.stdout) as { id: string }[];
  expect(rows.map((row) => row.id)).toEqual(['com.example/filesystem']);
  const empty = server({ id: 'com.example/empty', name: 'com.example/empty' });
  const installable = await runCli(['list', '-i', '--json'], deps(dir, catalog([filesystem(), empty])));
  expect((JSON.parse(installable.stdout) as { id: string }[]).map((row) => row.id)).toEqual(['com.example/filesystem']);
  const bad = await runCli(['list', '-t', 'nope'], deps(dir));
  expect(bad.stderr).toContain('Unknown theme nope');
});

it('needs -a without a terminal and leaves a high risk out unless --no-audit', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  const cursor = clientConfigPath('cursor', 'user', ctx);
  const missing = await runCli(['install', 'com.example/filesystem', '-g', '-y'], deps(dir));
  expect(missing.code).not.toBe(0);
  expect(missing.stderr).toContain('-a');
  expect(existsSync(cursor)).toBe(false);

  const blocked = await runCli(['install', 'com.example/loose', '-a', 'cursor', '-g'], deps(dir));
  expect(blocked.code).not.toBe(0);
  expect(blocked.stderr).toContain('com.example/loose fails the audit');
  expect(existsSync(cursor)).toBe(false);

  const dry = await runCli(['install', 'com.example/filesystem', '-a', 'cursor', '-g', '--dry-run'], deps(dir));
  expect(dry.code).toBe(0);
  expect(dry.stdout).toContain('dry-run');
  expect(existsSync(cursor)).toBe(false);

  const forced = await runCli(['install', 'com.example/loose', '-a', 'cursor', '-g', '--no-audit'], deps(dir));
  expect(forced.code).toBe(0);
  expect(existsSync(cursor)).toBe(true);
});

it('remembers the clients and scope of an install, and -y reuses them', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  let saved: UserConfig = {};
  const work = join(dir, 'work');
  const remembering = { ...deps(dir), cwd: work, readConfig: () => saved, writeConfig: (next: UserConfig) => (saved = next) };
  expect((await runCli(['install', 'com.example/filesystem', '-a', 'cursor', '-g'], remembering)).code).toBe(0);
  expect(saved).toMatchObject({ agents: ['cursor'], scope: 'user' });
  const grok = clientConfigPath('grok', 'project', { ...ctx, projectRoot: work });
  expect((await runCli(['install', 'com.example/filesystem', '-a', 'grok', '-y'], remembering)).code).toBe(0);
  // -y without -g/-p takes the remembered scope.
  expect(existsSync(grok)).toBe(false);
  expect(existsSync(clientConfigPath('grok', 'user', ctx))).toBe(true);
});

it('reports a server with nothing to install and installs the others', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  const empty = server({ id: 'com.example/empty', name: 'com.example/empty' });
  const result = await runCli(['install', 'com.example/empty', 'com.example/filesystem', '-a', 'cursor', '-g'], deps(dir, catalog([filesystem(), empty])));
  expect(result.stderr).toContain('com.example/empty');
  expect(result.stdout).toContain('1/2');
  expect(existsSync(clientConfigPath('cursor', 'user', ctx))).toBe(true);
});

it('asks the wizard for what the flags leave open', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  let asked: unknown;
  const result = await runCli(['install', 'com.example/filesystem'], {
    ...deps(dir),
    interactive: true,
    runWizard: async (props) => {
      asked = props.initialIds;
      return { ids: ['com.example/filesystem'], remove: [], update: [], options: { agents: ['claude-code'], scope: 'project' } };
    },
  });
  expect(result.code).toBe(0);
  expect(asked).toEqual(['com.example/filesystem']);
  expect(existsSync(clientConfigPath('claude-code', 'project', ctx))).toBe(true);
});

it('uninstalls by id and refuses an id that is not installed', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  const cursor = cursorFile(ctx, { filesystem: { command: 'npx', args: ['@example/filesystem@1.2.3'] } });
  const absent = await runCli(['uninstall', 'com.example/loose'], deps(dir));
  expect(absent.code).not.toBe(0);
  expect((await runCli(['uninstall', 'com.example/filesystem', '-a', 'cursor'], deps(dir))).code).toBe(0);
  expect((JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: object }).mcpServers).toEqual({});
});

it('shows other versions and local entries as installed, and unticking a local one uninstalls it', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  const cursor = cursorFile(ctx, { fs: { command: 'npx', args: ['@example/filesystem@1.0.0'] }, custom: { command: 'echo', args: ['hi'] } });
  let shown: string[] = [];
  let description: string | undefined;
  const result = await runCli(['browse', '-g'], {
    ...deps(dir),
    interactive: true,
    runWizard: async (props) => {
      // The tree comes back after each run: the second time, quit.
      if (shown.length) return null;
      const state = await props.loadInstalled!(['user']);
      shown = [...state.installed.keys()].sort();
      description = state.installed.get('local:custom')?.local?.description;
      return { ids: [], remove: [{ id: 'local:custom', scopes: ['user'] }], update: [], options: { agents: [], scope: 'user' } };
    },
  });
  expect(result.code).toBe(0);
  expect(shown).toEqual(['com.example/filesystem', 'local:custom']);
  expect(description).toBe('echo hi');
  expect(Object.keys((JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: object }).mcpServers)).toEqual(['fs']);
});

it('prints risks on stderr and one JSON object with --json', async () => {
  const { dir } = dirOf('mcp-atlas-cli-');
  const shown = await runCli(['show', 'com.example/filesystem'], deps(dir));
  expect(shown.code).toBe(0);
  expect(shown.stderr).toContain('pinned');
  expect(shown.stdout).toContain('# Hello from the readme');
  const json = await runCli(['show', 'com.example/filesystem', '--json'], deps(dir));
  const body = JSON.parse(json.stdout) as { id: string; readme: string; risks: unknown[] };
  expect(body.id).toBe('com.example/filesystem');
  expect(body.readme).toContain('Hello');
  expect(body.risks.length).toBeGreaterThan(0);
});

it('names unknown, current, and outdated versions, and update rewrites the outdated pin', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  cursorFile(ctx, { filesystem: { command: 'npx', args: ['-y', '@example/filesystem'] } });
  const unknown = await runCli(['outdated', '-a', 'cursor', '-g'], deps(dir));
  expect(unknown.stdout).toContain('unknown version');
  expect(unknown.stdout).not.toContain('up to date');

  const cursor = cursorFile(ctx, { filesystem: { command: 'npx', args: ['@example/filesystem@1.0.0'] } });
  const drifted = await runCli(['outdated', '-a', 'cursor', '-g', '--json'], deps(dir));
  expect(JSON.parse(drifted.stdout)).toMatchObject([{ status: 'outdated', scope: 'user' }]);

  const updated = await runCli(['update'], deps(dir));
  expect(updated.code).toBe(0);
  const after = JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: Record<string, { args: string[] }> };
  expect(after.mcpServers.filesystem?.args).toEqual(['@example/filesystem@1.2.3']);

  const current = await runCli(['outdated', '-g'], deps(dir));
  expect(current.stdout).toContain('up to date');
  expect((await runCli(['update'], deps(dir))).stdout).toContain('up to date');
});

it('exports matched ids and stops an import before writing a bad id', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  cursorFile(ctx, { filesystem: { command: 'npx', args: ['@example/filesystem@1.2.3'] }, custom: { command: 'echo', args: ['hi'] } });
  const file = join(dir, 'bundle.json');
  const exported = await runCli(['export', '-g'], deps(dir));
  expect(JSON.parse(exported.stdout)).toEqual({ mcpAtlas: 1, servers: ['com.example/filesystem'] });

  writeFileSync(file, JSON.stringify({ mcpAtlas: 1, servers: ['com.example/filesystem', '-y'] }));
  const imported = await runCli(['import', file, '-a', 'grok', '-g', '-y'], deps(dir));
  expect(imported.code).not.toBe(0);
  expect(imported.stderr).toContain('-y');
  expect(existsSync(clientConfigPath('grok', 'user', ctx))).toBe(false);

  writeFileSync(file, JSON.stringify({ mcpAtlas: 1, servers: ['com.example/filesystem'] }));
  expect((await runCli(['import', file, '-a', 'grok', '-g'], deps(dir))).code).toBe(0);
  expect(existsSync(clientConfigPath('grok', 'user', ctx))).toBe(true);
});

it('pins mcp-atlas.json with lock, and sync installs what is missing', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  const project = join(dir, 'mcp-atlas.json');
  expect((await runCli(['sync'], deps(dir))).stderr).toContain('no such file');
  writeFileSync(project, JSON.stringify({ servers: ['com.example/filesystem'], agents: ['cursor'] }));
  expect((await runCli(['lock'], deps(dir))).stdout).toContain('com.example/filesystem: - -> 1.2.3');
  expect(JSON.parse(readFileSync(project, 'utf8'))).toMatchObject({ versions: { 'com.example/filesystem': '1.2.3' } });

  const check = await runCli(['sync', '--check'], deps(dir));
  expect(check.code).not.toBe(0);
  expect(check.stdout).toContain('com.example/filesystem');
  expect((await runCli(['sync'], deps(dir))).code).toBe(0);
  expect(existsSync(clientConfigPath('cursor', 'project', ctx))).toBe(true);
  expect((await runCli(['sync', '--check'], deps(dir))).code).toBe(0);
});

it('installs a pack and lists it', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  const pack = { id: 'files', name: 'Files', description: 'File tools', servers: ['com.example/filesystem', 'com.example/gone'] };
  const withPack = { ...deps(dir), packs: () => [pack] };
  const listed = await runCli(['packs'], withPack);
  expect(listed.stdout).toContain('1/2');
  expect(listed.stdout).toContain('com.example/gone');
  expect((await runCli(['install', '--pack', 'nope', '-a', 'cursor', '-g'], withPack)).code).not.toBe(0);
  expect((await runCli(['install', '--pack', 'files', '-a', 'cursor', '-g'], withPack)).code).toBe(0);
  expect(existsSync(clientConfigPath('cursor', 'user', ctx))).toBe(true);
});

it('reports a missing command with doctor and switches the audit', async () => {
  const { dir, ctx } = dirOf('mcp-atlas-cli-');
  cursorFile(ctx, { gone: { command: 'definitely-not-a-command-xyz', args: [] }, remote: { url: 'https://example.com/mcp' } });
  const sick = await runCli(['doctor', '-g', '--json'], { ...deps(dir), env: { PATH: dir } });
  const issues = JSON.parse(sick.stdout) as { code: string; key: string }[];
  expect(issues).toEqual([expect.objectContaining({ code: 'missing-command', key: 'gone' })]);
  process.exitCode = 0;

  let saved: UserConfig = {};
  const audit = { ...deps(dir), readConfig: () => saved, writeConfig: (next: UserConfig) => (saved = next) };
  expect((await runCli(['audit', 'off'], audit)).stdout).toContain('off');
  expect(saved.audit).toBe(false);
  expect((await runCli(['audit'], audit)).stdout).toContain('off');
  expect((await runCli(['audit', 'maybe'], audit)).code).not.toBe(0);
});

it('reports a recommended id that is not in the catalog', async () => {
  const { dir } = dirOf('mcp-atlas-cli-');
  const user = join(dir, 'recommended.json');
  writeFileSync(user, JSON.stringify({ servers: [{ id: 'com.example/filesystem' }, { id: 'com.example/missing' }] }));
  const result = await runCli(['themes'], { ...deps(dir, catalog([filesystem()])), recommendedUser: user });
  expect(result.stderr).toContain('ignored, not in the catalog: com.example/missing');
  expect(result.stdout).toContain('recommended');
});

it('marks detected clients and completes from the offline snapshot', async () => {
  const { dir } = dirOf('mcp-atlas-cli-');
  const none = await runCli(['agents'], { ...deps(dir), exists: () => false, platform: 'linux' });
  expect(none.stdout).toContain('cursor');
  expect(none.stdout).not.toContain('detected');
  const found = await runCli(['clients'], { ...deps(dir), exists: () => true, platform: 'win32' });
  expect(found.stdout).toContain('cursor detected');

  let offline = false;
  const completed = await runCli(['__complete', '--', 'show', 'com.example/f'], {
    ...deps(dir),
    loadCatalog: async (flags) => {
      offline = flags.offline === true;
      return catalog([filesystem()]);
    },
  });
  expect(offline).toBe(true);
  expect(completed.stdout).toContain('com.example/filesystem');
  expect((await runCli(['__complete', '--', 'install', '--ag'], deps(dir))).stdout).toContain('--agent');
  const script = await runCli(['completion', 'powershell'], deps(dir));
  expect(script.stdout).toContain('__complete');
  expect(script.stdout).toContain('mcp-atlas');
  expect((await runCli(['completion', 'cmd'], deps(dir))).code).not.toBe(0);
});

it('wires browse, ui, and mcp without starting them', async () => {
  const { dir } = dirOf('mcp-atlas-cli-');
  expect((await runCli(['browse'], deps(dir))).stderr).toContain('interactive terminal');
  let preset: unknown;
  const browsed = await runCli(['browse', '-a', 'cursor', '-g'], {
    ...deps(dir),
    interactive: true,
    runWizard: async (props) => {
      preset = props.preset;
      return null;
    },
  });
  expect(preset).toEqual({ agents: ['cursor'], scope: 'user' });
  expect(browsed.stdout).toContain('Nothing changed');
  let demo = false;
  let opened = '';
  const ui = await runCli(['ui', '--demo'], {
    ...deps(dir),
    startUi: async (opts) => {
      demo = opts.demo === true;
      return { url: 'http://127.0.0.1:9/', close: async () => {} };
    },
    openBrowser: (url) => (opened = url),
    untilInterrupted: async () => {},
  });
  expect(demo).toBe(true);
  expect(opened).toBe('http://127.0.0.1:9/');
  expect(ui.stdout).toContain('http://127.0.0.1:9/');
  let mcp = false;
  await runCli(['mcp'], {
    ...deps(dir),
    serveMcp: async () => {
      mcp = true;
    },
  });
  expect(mcp).toBe(true);
});
