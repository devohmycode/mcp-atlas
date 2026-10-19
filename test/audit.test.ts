import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { auditAllows, auditEnabled, auditServer, failsAudit } from '../src/audit.js';
import { configPath, readConfig, writeConfig } from '../src/config.js';
import type { Server } from '../src/types.js';

function server(partial: Pick<Server, 'packages' | 'remotes'>) {
  return { id: 'com.example/filesystem', ...partial };
}

const pinned = server({
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' }],
  remotes: [],
});

const unpinned = server({
  packages: [{ registryType: 'npm', identifier: '@example/filesystem', transport: 'stdio' }],
  remotes: [],
});

const unreadable = server({ packages: [], remotes: [] });

it('fails the audit when a risk is high', () => {
  const result = auditServer(unpinned);
  expect(result.status).toBe('fail');
  expect(result.risks.some((risk) => risk.level === 'high')).toBe(true);
  expect(failsAudit(result)).toBe(true);
  expect(auditAllows(result)).toBe(false);
});

it('does not fail the audit for a pinned package', () => {
  const result = auditServer(pinned);
  expect(result.status).toBe('pass');
  expect(result.risks.map((risk) => risk.level)).toEqual(['info']);
  expect(failsAudit(result)).toBe(false);
  expect(auditAllows(result)).toBe(true);
});

it('reports an unreadable command as not audited, which is not a failure', () => {
  const result = auditServer(unreadable);
  expect(result.status).toBe('unaudited');
  expect(result.reason).toBe('No package or remote to install');
  expect(result.risks).toEqual([]);
  expect(failsAudit(result)).toBe(false);
  expect(auditAllows(result)).toBe(true);
});

it('audits unless this run or the saved config turns it off', () => {
  expect(auditEnabled({})).toBe(true);
  expect(auditEnabled({}, false)).toBe(false);
  expect(auditEnabled({ audit: false })).toBe(false);
  expect(auditEnabled({ audit: false }, true)).toBe(false);
  const high = auditServer(unpinned);
  expect(auditAllows(high, {}, false)).toBe(true);
  expect(auditAllows(high, { audit: false })).toBe(true);
});

it('remembers the audit switch in the config file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-atlas-'));
  const path = join(dir, 'config.json');
  try {
    expect(configPath({ XDG_CONFIG_HOME: dir }, join(dir, 'unused'))).toBe(join(dir, 'mcp-atlas', 'config.json'));
    expect(readConfig(path)).toEqual({});
    writeFileSync(path, '{');
    expect(readConfig(path)).toEqual({});
    writeConfig({ audit: false }, path);
    expect(readConfig(path)).toEqual({ audit: false });
    expect(auditAllows(auditServer(unpinned), readConfig(path))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
