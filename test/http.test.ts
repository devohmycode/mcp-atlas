import { expect, it } from 'vitest';
import { fetchJson, fetchJsonPages, HttpError, MAX_PAGES, NotJsonError, PageLimitError, PROGRESS_EVERY } from '../src/http.js';

function jsonFetch(body: unknown, onCall?: (init: RequestInit | undefined) => void): typeof fetch {
  return async (_url, init) => {
    onCall?.(init);
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

it('sends a User-Agent and does not retry a failed request', async () => {
  let calls = 0;
  let ua = '';
  const fetchImpl: typeof fetch = async (_url, init) => {
    calls += 1;
    ua = new Headers(init?.headers).get('user-agent') ?? '';
    throw new Error('down');
  };
  await expect(fetchJson('http://example.test/servers', { fetch: fetchImpl })).rejects.toThrow('down');
  expect(calls).toBe(1);
  expect(ua).toContain('mcp-atlas');
});

it('names a non-JSON body', async () => {
  const fetchImpl: typeof fetch = async () => new Response('nope', { status: 200 });
  await expect(fetchJson('http://example.test/servers', { fetch: fetchImpl })).rejects.toBeInstanceOf(NotJsonError);
});

it('names an HTTP error without a second attempt', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response('no', { status: 500 });
  };
  await expect(fetchJson('http://example.test/servers', { fetch: fetchImpl })).rejects.toBeInstanceOf(HttpError);
  expect(calls).toBe(1);
});

it('aborts when the timeout fires', async () => {
  const fetchImpl: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('missing signal'));
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  await expect(fetchJson('http://example.test/servers', { timeoutMs: 20, fetch: fetchImpl })).rejects.toMatchObject({
    name: 'TimeoutError',
  });
});

it('stops at the page cap and does not request the next page', async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ items: [String(url)], next: `${url}/next` }), { status: 200 });
  };
  await expect(
    fetchJsonPages('http://example.test/p', (body) => {
      const page = body as { items: string[]; next?: string };
      return { items: page.items, nextUrl: page.next };
    }, { maxPages: 2, fetch: fetchImpl }),
  ).rejects.toBeInstanceOf(PageLimitError);
  expect(seen).toEqual(['http://example.test/p', 'http://example.test/p/next']);
});

it('returns every page when the last one has no next url', async () => {
  const fetchImpl = jsonFetch({ items: [1] });
  const items = await fetchJsonPages('http://example.test/p', () => ({ items: [1] }), { fetch: fetchImpl });
  expect(items).toEqual([1]);
});

it('retries a crawl page after a 5xx or a timeout, never after a 4xx', async () => {
  const statuses = [503, 200];
  const flaky: typeof fetch = async () => new Response(JSON.stringify({ items: [1] }), { status: statuses.shift() ?? 200 });
  const read = (body: unknown) => ({ items: (body as { items: number[] }).items });
  expect(await fetchJsonPages('http://example.test/a', read, { fetch: flaky, retryDelaysMs: [0, 0] })).toEqual([1]);

  let calls = 0;
  const denied: typeof fetch = async () => {
    calls += 1;
    return new Response('no', { status: 401 });
  };
  await expect(fetchJsonPages('http://example.test/a', read, { fetch: denied, retryDelaysMs: [0, 0] })).rejects.toBeInstanceOf(HttpError);
  expect(calls).toBe(1);

  calls = 0;
  const down: typeof fetch = async () => {
    calls += 1;
    throw new Error('timeout');
  };
  await expect(fetchJsonPages('http://example.test/a', read, { fetch: down, retryDelaysMs: [0, 0] })).rejects.toThrow('timeout');
  expect(calls).toBe(3);
});

it('sends extra headers without dropping the User-Agent', async () => {
  let headers = new Headers();
  await fetchJson('http://example.test/servers', {
    headers: { authorization: 'Bearer k' },
    fetch: jsonFetch({}, (init) => (headers = new Headers(init?.headers))),
  });
  expect(headers.get('authorization')).toBe('Bearer k');
  expect(headers.get('user-agent')).toContain('mcp-atlas');
});

it('allows the official registry page count with room to grow', () => {
  expect(MAX_PAGES).toBeGreaterThanOrEqual(1_000);
});

it('prints one progress line every PROGRESS_EVERY pages', async () => {
  const total = PROGRESS_EVERY * 2 + 3;
  let n = 0;
  const lines: string[] = [];
  const items = await fetchJsonPages(
    'http://example.test/p',
    () => {
      n += 1;
      return { items: [n], nextUrl: n < total ? `http://example.test/p?page=${n + 1}` : undefined };
    },
    { fetch: jsonFetch({}), progress: (line) => lines.push(line) },
  );
  expect(items).toHaveLength(total);
  expect(lines).toEqual([
    `example.test: ${PROGRESS_EVERY} pages, ${PROGRESS_EVERY} servers`,
    `example.test: ${PROGRESS_EVERY * 2} pages, ${PROGRESS_EVERY * 2} servers`,
  ]);
});
