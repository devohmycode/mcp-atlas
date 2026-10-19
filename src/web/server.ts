import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { auditEnabled, auditServer, failsAudit, type AuditResult } from '../audit.js';
import { CLIENTS } from '../clients.js';
import type { UserConfig } from '../config.js';
import { detectClients } from '../detect.js';
import { getLang, t, themeLabel } from '../i18n/index.js';
import { installedMap, outdatedAll, uninstallEverywhere, updateRows, type ScopedRow } from '../manage.js';
import { clientsForScope, installServers, operateContext, type OperateContext } from '../operate.js';
import { readReadme } from '../readme.js';
import { commandText, isHighRisk, reviewItems } from '../review.js';
import { SORT_ORDERS, searchServers } from '../search.js';
import { CLIENT_IDS, SCOPES, type Catalog, type Server } from '../types.js';
import { renderPage } from './page.js';

export interface UiOptions {
  /** Catalog with the packs already added as themes. */
  catalog: Catalog;
  /** A demo serves the fiches and refuses every write. */
  demo?: boolean;
  port?: number;
  home: string;
  cwd: string;
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  config?: UserConfig;
  /** README reads; injected in tests. */
  fetch?: typeof fetch;
}

export interface UiServer {
  /** Address to open, token included. */
  url: string;
  port: number;
  token: string;
  close: () => Promise<void>;
}

/** Theme id of the installed servers in `/api/servers`. */
export const INSTALLED_THEME = 'installed';
const MAX_LIMIT = 500;
const MAX_BODY = 1_000_000;

const ChangeBody = z.object({
  install: z.array(z.string()).max(2000).default([]),
  remove: z.array(z.string()).max(2000).default([]),
  update: z.array(z.string()).max(2000).default([]),
  clients: z.array(z.enum(CLIENT_IDS)).max(CLIENT_IDS.length).default([]),
  scope: z.enum(SCOPES),
  /** Ids kept despite a failed audit ("install anyway"). */
  acceptRisk: z.array(z.string()).max(2000).default([]),
});

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const slim = (server: Server) => ({
  id: server.id,
  name: server.name,
  title: server.title,
  description: server.description,
  official: server.official,
  themes: server.themes,
  highRisk: isHighRisk(server),
});

/**
 * Local page on 127.0.0.1. Every `/api/` call carries the random token of the URL
 * (header `x-atlas-token`) and a local Host, so no other web page can drive a write.
 * `/api/plan` writes nothing; `/api/apply` refuses a failed audit unless the id is in `acceptRisk`.
 */
export async function startUi(opts: UiOptions): Promise<UiServer> {
  const { catalog } = opts;
  const byId = new Map(catalog.servers.map((server) => [server.id, server]));
  const ctx: OperateContext = { home: opts.home, cwd: opts.cwd, platform: opts.platform, env: opts.env, config: opts.config };
  const token = randomBytes(24).toString('hex');
  let running = false;

  function state() {
    const installed = installedMap(catalog, ctx, SCOPES);
    const detected = detectClients(existsSync, operateContext(ctx));
    const web = t().web;
    return {
      lang: getLang(),
      messages: { ...web, noRisk: t().tree.noRisk, riskLevels: t().tree.riskLevels, installedTheme: t().themes.installed ?? web.installed },
      demo: opts.demo === true,
      cwd: opts.cwd,
      audit: auditEnabled(opts.config),
      themes: catalog.themes.map((theme) => ({ id: theme.id, label: themeLabel(theme), description: theme.description })),
      clients: CLIENTS.map((spec) => ({ id: spec.id, scopes: spec.scopes, detected: detected.includes(spec.id) })),
      defaults: { clients: opts.config?.agents?.length ? opts.config.agents : detected, scope: opts.config?.scope ?? 'project' },
      installed: [...installed].map(([id, entry]) => ({ id, scopes: entry.scopes, clients: entry.clients })),
      outdated: outdated().map((row) => ({ id: row.id, scope: row.scope, installed: row.installed, catalog: row.catalog })),
    };
  }

  const outdated = () => outdatedAll(catalog, ctx, SCOPES).filter((row) => row.status === 'outdated');

  function serversPage(params: URLSearchParams) {
    const theme = params.get('theme') || undefined;
    const matching = searchServers(catalog.servers, {
      query: params.get('q') ?? '',
      official: params.get('official') === '1',
      sort: SORT_ORDERS.find((order) => order === params.get('sort')),
    });
    const installed = installedMap(catalog, ctx, SCOPES);
    const counts: Record<string, number> = { [INSTALLED_THEME]: 0 };
    for (const server of matching) {
      for (const id of server.themes) counts[id] = (counts[id] ?? 0) + 1;
      if (installed.has(server.id)) counts[INSTALLED_THEME]! += 1;
    }
    const inTheme =
      theme === INSTALLED_THEME ? matching.filter((server) => installed.has(server.id)) : theme ? matching.filter((server) => server.themes.includes(theme)) : matching;
    const offset = Math.max(0, Number(params.get('offset')) || 0);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || 100));
    return { total: inTheme.length, all: matching.length, counts, items: inTheme.slice(offset, offset + limit).map(slim) };
  }

  async function details(id: string | null) {
    const server = id ? byId.get(id) : undefined;
    if (!server) throw new HttpError(404, t().errors.unknownServer(id ?? ''));
    const base = { id: server.id, title: server.title || server.name, repository: server.repository?.url, command: commandText(server), audit: auditServer(server) };
    try {
      return { ...base, readme: await readReadme(catalog, server.id, { fetch: opts.fetch }) };
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Checks a change against the catalog and the client files, and says what it would do. */
  function plan(raw: unknown) {
    const parsed = ChangeBody.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, 'Invalid request');
    const body = parsed.data;
    const install = [...new Set(body.install)];
    const unknown = [...install, ...body.update].filter((id) => !byId.has(id));
    if (unknown.length) throw new HttpError(400, t().errors.unknownServer(unknown.join(', ')));
    const installed = installedMap(catalog, ctx, SCOPES);
    const absent = body.remove.filter((id) => !installed.has(id));
    if (absent.length) throw new HttpError(400, `${absent.join(', ')} is not installed`);
    const rows = outdated().filter((row) => body.update.includes(row.id));
    const stale = body.update.filter((id) => !rows.some((row) => row.id === id));
    if (stale.length) throw new HttpError(400, `${stale.join(', ')} has no update`);
    if (install.length && !body.clients.length) throw new HttpError(400, t().web.needClient);
    let clients = body.clients;
    try {
      if (clients.length) clients = clientsForScope(body.scope, clients);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
    const enabled = auditEnabled(opts.config);
    const audited = [...new Set([...install, ...body.update])].map((id) => auditServer(byId.get(id)!));
    const blocked = enabled ? audited.filter((result) => failsAudit(result) && !body.acceptRisk.includes(result.id)) : [];
    return {
      body: { ...body, install, clients },
      rows,
      review: {
        install: reviewItems(catalog, install, { clients, scope: body.scope }),
        remove: [...new Set(body.remove)].map((id) => ({ id, scopes: installed.get(id)!.scopes })),
        update: rows.map((row) => ({ id: row.id, scope: row.scope, path: row.path, installed: row.installed, catalog: row.catalog })),
        audit: { enabled, results: audited satisfies AuditResult[] },
        blocked: blocked.map((result) => result.id),
      },
    };
  }

  /** Runs each operation on its own, so one failure does not stop the rest and can be retried. */
  async function apply(raw: unknown) {
    if (opts.demo === true) throw new HttpError(403, t().web.demo);
    const { body, rows, review } = plan(raw);
    if (review.blocked.length) throw new HttpError(409, `${t().web.auditBlocked}: ${review.blocked.join(', ')}`);
    if (!body.install.length && !review.remove.length && !rows.length) throw new HttpError(400, t().web.nothing);
    if (running) throw new HttpError(409, t().web.busy);
    running = true;
    const results: { op: 'install' | 'remove' | 'update'; id: string; ok: boolean; error?: string }[] = [];
    const attempt = async (op: (typeof results)[number]['op'], id: string, run: () => Promise<unknown>) => {
      try {
        await run();
        results.push({ op, id, ok: true });
      } catch (err) {
        results.push({ op, id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    };
    try {
      for (const { id, scopes } of review.remove) await attempt('remove', id, () => uninstallEverywhere(catalog, [id], scopes, ctx));
      for (const id of new Set(rows.map((row) => row.id))) {
        const mine: ScopedRow[] = rows.filter((row) => row.id === id);
        await attempt('update', id, async () => {
          if ((await updateRows(catalog, mine, ctx)) < mine.length) throw new Error(`${id} was not rewritten`);
        });
      }
      for (const id of body.install) {
        await attempt('install', id, () =>
          installServers({ catalog, ids: [id], clients: body.clients, scope: body.scope, ctx, yes: true, acceptHighRisk: body.acceptRisk.includes(id), policy: 'refuse' }),
        );
      }
    } finally {
      running = false;
    }
    return { ok: results.every((result) => result.ok), results };
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (res.headersSent) return res.end();
      json(res, { error: err instanceof Error ? err.message : String(err) }, err instanceof HttpError ? err.status : 500);
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const port = (server.address() as AddressInfo).port;
    // DNS rebinding: a page on another host name resolving to 127.0.0.1 is refused.
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) throw new HttpError(403, 'Forbidden host');
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/') {
      const html = renderPage();
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:",
        'x-frame-options': 'DENY',
      });
      return res.end(html);
    }
    if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'Not found');
    if (!validToken(req.headers['x-atlas-token'])) throw new HttpError(401, 'Bad token');
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, state());
    if (req.method === 'GET' && url.pathname === '/api/servers') return json(res, serversPage(url.searchParams));
    if (req.method === 'GET' && url.pathname === '/api/details') return json(res, await details(url.searchParams.get('id')));
    if (req.method === 'POST' && url.pathname === '/api/plan') return json(res, plan(await readJson(req)).review);
    if (req.method === 'POST' && url.pathname === '/api/apply') return json(res, await apply(await readJson(req)));
    throw new HttpError(404, 'Not found');
  }

  function validToken(value: string | string[] | undefined): boolean {
    if (typeof value !== 'string' || value.length !== token.length) return false;
    return timingSafeEqual(Buffer.from(value), Buffer.from(token));
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/#${token}`,
    port,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function json(res: ServerResponse, body: unknown, status = 200): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Expected JSON');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Body is too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'Body is not JSON');
  }
}
