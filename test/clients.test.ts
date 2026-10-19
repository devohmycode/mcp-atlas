import { expect, it } from 'vitest';
import { CLIENTS, ClientPathError, clientConfigPath, clientsCovered } from '../src/clients.js';
import { CLIENT_IDS, type ClientId } from '../src/types.js';

const covered: Record<ClientId, true> = {
  'claude-code': true,
  'claude-desktop': true,
  cursor: true,
  'codex-cli': true,
  'codex-desktop': true,
  grok: true,
};

it('lists every client once, and only the declared key is writable', () => {
  expect(clientsCovered()).toBe(true);
  expect(CLIENTS.map((c) => c.id)).toEqual([...CLIENT_IDS]);
  expect(Object.keys(covered)).toHaveLength(CLIENT_IDS.length);
  for (const spec of CLIENTS) {
    expect(spec.writable).toBe(spec.format === 'json' ? 'mcpServers' : 'mcp_servers');
  }
  expect(CLIENTS.find((c) => c.id === 'claude-desktop')?.scopes).toEqual(['user']);
  expect(CLIENTS.find((c) => c.id === 'codex-desktop')?.sameFilesAs).toBe('codex-cli');
  expect(CLIENTS.filter((c) => c.projectTrustedOnly).map((c) => c.id)).toEqual(['codex-cli', 'codex-desktop']);
});

it('resolves each user file for Windows, macOS and Linux', () => {
  const home = { win32: 'C:\\Users\\ada', darwin: '/Users/ada', linux: '/home/ada' } as const;
  const expectPath = (id: ClientId, platform: keyof typeof home, env: NodeJS.ProcessEnv, wanted: string) => {
    expect(clientConfigPath(id, 'user', { platform, home: home[platform], env })).toBe(wanted);
  };

  expectPath('claude-code', 'linux', {}, '/home/ada/.claude.json');
  expectPath('claude-code', 'win32', {}, 'C:\\Users\\ada\\.claude.json');
  expectPath('claude-code', 'linux', { CLAUDE_CONFIG_DIR: '/data/claude' }, '/data/claude/.claude.json');

  expectPath(
    'claude-desktop',
    'win32',
    { APPDATA: 'C:\\Users\\ada\\AppData\\Roaming' },
    'C:\\Users\\ada\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
  );
  expectPath(
    'claude-desktop',
    'darwin',
    {},
    '/Users/ada/Library/Application Support/Claude/claude_desktop_config.json',
  );
  expectPath('claude-desktop', 'linux', {}, '/home/ada/.config/Claude/claude_desktop_config.json');

  expectPath('cursor', 'darwin', {}, '/Users/ada/.cursor/mcp.json');
  expectPath('cursor', 'win32', {}, 'C:\\Users\\ada\\.cursor\\mcp.json');

  expectPath('codex-cli', 'linux', {}, '/home/ada/.codex/config.toml');
  expectPath('codex-cli', 'win32', {}, 'C:\\Users\\ada\\.codex\\config.toml');
  expectPath('codex-cli', 'win32', { CODEX_HOME: 'D:\\codex' }, 'D:\\codex\\config.toml');
  expectPath('codex-desktop', 'linux', { CODEX_HOME: '/opt/codex' }, '/opt/codex/config.toml');

  expectPath('grok', 'linux', {}, '/home/ada/.grok/config.toml');
  expectPath('grok', 'win32', {}, 'C:\\Users\\ada\\.grok\\config.toml');
});

it('resolves project files and refuses a scope a client does not have', () => {
  const ctx = { platform: 'linux' as const, home: '/home/ada', projectRoot: '/work/app' };
  expect(clientConfigPath('claude-code', 'project', ctx)).toBe('/work/app/.mcp.json');
  expect(clientConfigPath('cursor', 'project', ctx)).toBe('/work/app/.cursor/mcp.json');
  expect(clientConfigPath('codex-cli', 'project', ctx)).toBe('/work/app/.codex/config.toml');
  expect(clientConfigPath('codex-desktop', 'project', ctx)).toBe('/work/app/.codex/config.toml');
  expect(clientConfigPath('grok', 'project', ctx)).toBe('/work/app/.grok/config.toml');
  expect(() => clientConfigPath('claude-desktop', 'project', ctx)).toThrow(ClientPathError);
  expect(() => clientConfigPath('cursor', 'project', { ...ctx, projectRoot: undefined })).toThrow(ClientPathError);
});
