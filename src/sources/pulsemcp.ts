import { fetchJsonPages, type FetchOptions } from '../http.js';
import type { Source } from '../source.js';
import { parseOfficialPage } from './official.js';

const ORIGIN = 'https://api.pulsemcp.com';

/** The v0.1 sub-registry follows the official registry spec: `cursor`, `limit` up to 100, `version=latest`. */
export function pulseUrl(cursor?: string): string {
  const url = new URL('/v0.1/servers', ORIGIN);
  url.searchParams.set('version', 'latest');
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  return url.toString();
}

/** Partner API: send `X-API-Key` and `X-Tenant-ID` through `opts.headers`. */
export function pulseSource(opts: FetchOptions = {}): Source {
  return {
    origin: 'pulsemcp',
    fetch: () =>
      fetchJsonPages(
        pulseUrl(),
        (body) => {
          const page = parseOfficialPage(body, 'pulsemcp');
          return { items: page.servers, nextUrl: page.nextCursor ? pulseUrl(page.nextCursor) : undefined };
        },
        opts,
      ),
  };
}
