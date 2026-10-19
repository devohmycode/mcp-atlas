import type { Catalog, Server, Theme } from '../src/types.js';

export function server(partial: Partial<Server> & Pick<Server, 'id'>): Server {
  return {
    name: partial.id,
    origins: ['official'],
    themes: ['files'],
    official: true,
    singleRegistry: true,
    packages: [],
    remotes: [],
    repository: { url: 'https://github.com/example/filesystem' },
    ...partial,
  };
}

export function filesystem(): Server {
  return server({
    id: 'com.example/filesystem',
    name: 'com.example/filesystem',
    title: 'Filesystem',
    description: 'Read files',
    version: '1.2.3',
    packages: [{ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' }],
  });
}

export function loose(): Server {
  return server({
    id: 'com.example/loose',
    name: 'com.example/loose',
    title: 'Loose',
    description: 'Unpinned package',
    packages: [{ registryType: 'npm', identifier: '@example/loose', transport: 'stdio' }],
  });
}

export function catalog(servers: Server[], themes: Theme[] = [{ id: 'files', label: 'Files', description: 'Files and folders' }]): Catalog {
  return {
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    themes,
    servers,
    stats: {
      raw: {},
      sources: {},
      merged: servers.length,
      official: servers.filter((item) => item.official).length,
      singleRegistry: servers.length,
      byTheme: { files: servers.filter((item) => item.themes.includes('files')).length },
    },
  };
}
