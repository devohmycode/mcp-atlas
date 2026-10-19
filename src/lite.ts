import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultCatalogPath, LITE_CATALOG, loadCatalog, saveCatalog } from './catalog.js';
import { hasCommand } from './search.js';
import type { Catalog } from './types.js';

/**
 * The fiches with a package or a remote, and stats that match them. Most fiches have neither:
 * shipping them in the npm package would only make it heavier, and the full catalog is a download away.
 */
export function liteCatalog(catalog: Catalog): Catalog {
  const servers = catalog.servers.filter(hasCommand);
  const byTheme: Record<string, number> = {};
  for (const server of servers) for (const theme of server.themes) byTheme[theme] = (byTheme[theme] ?? 0) + 1;
  return {
    ...catalog,
    servers,
    stats: {
      ...catalog.stats,
      merged: servers.length,
      official: servers.filter((server) => server.official).length,
      singleRegistry: servers.filter((server) => server.singleRegistry).length,
      byTheme,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const full = defaultCatalogPath();
  const lite = liteCatalog(await loadCatalog(full));
  await saveCatalog(lite, join(dirname(full), LITE_CATALOG));
  console.log(`${LITE_CATALOG}: ${lite.servers.length} servers`);
}
