import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { clientConfigPath } from '../src/clients.js';
import { startUi, type UiOptions } from '../src/web/server.js';
import { catalog, filesystem, loose } from './fixture.js';

function home() {
  return mkdtempSync(join(tmpdir(), 'mcp-atlas-ui-'));
}

async function withUi(extra: Partial<UiOptions>, test: (ui: { url: string; api: (path: string, body?: unknown) => Promise<Response>; dir: string; cursor: string }) => Promise<void>) {
  const dir = home();
  const cwd = join(dir, 'project');
  mkdirSync(cwd);
  const ui = await startUi({ catalog: catalog([filesystem(), loose()]), port: 0, home: dir, cwd, platform: process.platform, env: {}, ...extra });
  const base = ui.url.replace(/#.*$/, '');
  const api = (path: string, body?: unknown) =>
    fetch(base + path.replace(/^\//, ''), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-atlas-token': ui.token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const cursor = clientConfigPath('cursor', 'user', { platform: process.platform, home: dir, projectRoot: cwd, env: {} });
  try {
    await test({ url: ui.url, api, dir, cursor });
  } finally {
    await ui.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const change = (extra: object) => ({ clients: ['cursor'], scope: 'user', ...extra });

it('serves the page, and the API only with the token', async () => {
  await withUi({}, async ({ url, api }) => {
    expect(url).toMatch(/#[0-9a-f]{48}$/);
    const html = await (await fetch(url)).text();
    expect(html).toContain("'/api/apply'");
    expect((await fetch(url.replace(/#.*$/, 'api/state'))).status).toBe(401);
    const state = (await (await api('/api/state')).json()) as { themes: { id: string }[]; clients: { id: string }[]; installed: unknown[]; messages: { apply: string } };
    expect(state.themes.map((theme) => theme.id)).toEqual(['files']);
    expect(state.clients.map((client) => client.id)).toContain('cursor');
    expect(state.installed).toEqual([]);
    expect(state.messages.apply).toBe('Apply');
  });
});

it('lists, filters and pages the servers', async () => {
  await withUi({}, async ({ api }) => {
    const all = (await (await api('/api/servers')).json()) as { total: number; counts: Record<string, number>; items: { id: string; highRisk: boolean }[] };
    expect(all.total).toBe(2);
    expect(all.counts.files).toBe(2);
    expect(all.items.find((item) => item.id === 'com.example/loose')?.highRisk).toBe(true);
    const found = (await (await api('/api/servers?q=filesystem&theme=files')).json()) as { total: number; items: { id: string }[] };
    expect(found.items.map((item) => item.id)).toEqual(['com.example/filesystem']);
    const page = (await (await api('/api/servers?limit=1&offset=1')).json()) as { total: number; items: unknown[] };
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    const mine = (await (await api('/api/servers?theme=installed')).json()) as { total: number };
    expect(mine.total).toBe(0);
  });
});

it('shows details with the README and the audit', async () => {
  const readme = (async () => new Response('# Filesystem\nReads files.')) as unknown as typeof fetch;
  await withUi({ fetch: readme }, async ({ api }) => {
    const details = (await (await api('/api/details?id=com.example/loose')).json()) as { readme: string; command: string; audit: { status: string } };
    expect(details.readme).toContain('# Filesystem');
    expect(details.command).toContain('npx');
    expect(details.audit.status).toBe('fail');
    expect((await api('/api/details?id=nope/x')).status).toBe(404);
  });
});

it('plans without writing, blocks a failed audit unless accepted, then installs and uninstalls', async () => {
  await withUi({}, async ({ api, cursor }) => {
    const plan = (await (await api('/api/plan', change({ install: ['com.example/filesystem', 'com.example/loose'] }))).json()) as {
      install: { id: string; command: string }[];
      blocked: string[];
    };
    expect(plan.install.map((item) => item.id)).toEqual(['com.example/filesystem', 'com.example/loose']);
    expect(plan.blocked).toEqual(['com.example/loose']);
    expect(existsSync(cursor)).toBe(false);

    expect((await api('/api/plan', { install: ['com.example/filesystem'], scope: 'user' })).status).toBe(400);
    const blocked = await api('/api/apply', change({ install: ['com.example/loose'] }));
    expect(blocked.status).toBe(409);
    expect(existsSync(cursor)).toBe(false);

    const applied = (await (await api('/api/apply', change({ install: ['com.example/filesystem', 'com.example/loose'], acceptRisk: ['com.example/loose'] }))).json()) as {
      ok: boolean;
      results: { op: string; id: string; ok: boolean }[];
    };
    expect(applied.ok).toBe(true);
    const written = JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(written.mcpServers).sort()).toEqual(['filesystem', 'loose']);

    const state = (await (await api('/api/state')).json()) as { installed: { id: string; scopes: string[] }[] };
    expect(state.installed.map((item) => item.id).sort()).toEqual(['com.example/filesystem', 'com.example/loose']);
    expect(state.installed[0]?.scopes).toEqual(['user']);

    const removed = (await (await api('/api/apply', change({ remove: ['com.example/loose'] }))).json()) as { ok: boolean };
    expect(removed.ok).toBe(true);
    const after = JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(after.mcpServers)).toEqual(['filesystem']);
    expect((await api('/api/apply', change({ remove: ['com.example/loose'] }))).status).toBe(400);
  });
});

it('reviews and applies an update of an outdated pin', async () => {
  await withUi({}, async ({ api, cursor }) => {
    mkdirSync(dirname(cursor), { recursive: true });
    writeFileSync(cursor, JSON.stringify({ mcpServers: { filesystem: { command: 'npx', args: ['-y', '@example/filesystem@1.0.0'] } } }));
    const state = (await (await api('/api/state')).json()) as { outdated: { id: string; installed: string; catalog: string }[] };
    expect(state.outdated).toEqual([{ id: 'com.example/filesystem', scope: 'user', installed: '1.0.0', catalog: '1.2.3' }]);
    const plan = (await (await api('/api/plan', change({ update: ['com.example/filesystem'] }))).json()) as { update: { id: string }[]; blocked: string[] };
    expect(plan.update.map((row) => row.id)).toEqual(['com.example/filesystem']);
    expect(plan.blocked).toEqual([]);
    const applied = (await (await api('/api/apply', change({ update: ['com.example/filesystem'] }))).json()) as { ok: boolean };
    expect(applied.ok).toBe(true);
    expect(readFileSync(cursor, 'utf8')).toContain('@example/filesystem@1.2.3');
    expect((await api('/api/plan', change({ update: ['com.example/filesystem'] }))).status).toBe(400);
  });
});

it('reports a failed operation per id so the page can retry it', async () => {
  await withUi({}, async ({ api, cursor }) => {
    // A file where the config directory should be: the write fails, the plan does not.
    writeFileSync(dirname(cursor), '');
    const applied = (await (await api('/api/apply', change({ install: ['com.example/filesystem'] }))).json()) as { ok: boolean; results: { id: string; ok: boolean; error?: string }[] };
    expect(applied.ok).toBe(false);
    expect(applied.results).toEqual([{ op: 'install', id: 'com.example/filesystem', ok: false, error: expect.any(String) }]);
    rmSync(dirname(cursor));
    const retried = (await (await api('/api/apply', change({ install: ['com.example/filesystem'] }))).json()) as { ok: boolean };
    expect(retried.ok).toBe(true);
  });
});

it('refuses every write on a demo server, and the static demo has no write call', async () => {
  await withUi({ demo: true }, async ({ api, cursor }) => {
    const state = (await (await api('/api/state')).json()) as { demo: boolean };
    expect(state.demo).toBe(true);
    for (const body of [{ install: ['com.example/filesystem'] }, { remove: ['com.example/filesystem'] }, { update: ['com.example/filesystem'] }]) {
      expect((await api('/api/apply', change(body))).status).toBe(403);
    }
    expect(existsSync(cursor)).toBe(false);
    const demo = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');
    expect(demo).not.toContain('fetch(');
  });
});

it('refuses a foreign Host header', async () => {
  await withUi({}, async ({ url }) => {
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(url.replace(/#.*$/, ''), { headers: { host: 'evil.example' } }, (res) => resolve(res.statusCode ?? 0));
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});
