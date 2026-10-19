import { expect, it } from 'vitest';
import { detectClients } from '../src/detect.js';
import type { PathContext } from '../src/clients.js';

const linux: PathContext = { platform: 'linux', home: '/home/ada', env: {} };
const mac: PathContext = { platform: 'darwin', home: '/Users/ada', env: {} };
const windows: PathContext = {
  platform: 'win32',
  home: 'C:\\Users\\ada',
  env: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local', APPDATA: 'C:\\Users\\ada\\AppData\\Roaming' },
};

function only(...paths: string[]) {
  const wanted = new Set(paths);
  return (path: string) => wanted.has(path);
}

it('detects a client from its config directory or its executable', () => {
  expect(detectClients(only('/home/ada/.grok'), linux)).toEqual(['grok']);
  expect(detectClients(only('/home/ada/.local/bin/claude'), linux)).toEqual(['claude-code']);
  expect(detectClients(only('/usr/local/bin/cursor'), linux)).toEqual(['cursor']);
  expect(detectClients(() => false, linux)).toEqual([]);
});

it('does not treat the Codex config directory as the desktop app', () => {
  expect(detectClients(only('/home/ada/.codex'), linux)).toEqual(['codex-cli']);
  expect(detectClients(() => true, linux)).not.toContain('codex-desktop');
  expect(detectClients(only('/Applications/ChatGPT.app'), mac)).toEqual(['codex-desktop']);
  expect(detectClients(only('/Applications/Codex.app'), mac)).toEqual(['codex-desktop']);
  expect(detectClients(only('C:\\Users\\ada\\AppData\\Local\\Microsoft\\WindowsApps\\ChatGPT.exe'), windows)).toEqual([
    'codex-desktop',
  ]);
});
