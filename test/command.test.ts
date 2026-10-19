import { expect, it } from 'vitest';
import { CommandError, proposeCommand } from '../src/command.js';
import type { PackageRef, RemoteRef } from '../src/types.js';

function pkg(partial: PackageRef): PackageRef {
  return partial;
}

const http: RemoteRef = { type: 'streamable-http', url: 'https://example.com/mcp' };
const sse: RemoteRef = { type: 'sse', url: 'https://example.com/sse' };

it('proposes a pinned npm package without -y', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' })],
    }),
  ).toEqual({
    kind: 'stdio',
    runtime: 'npm',
    command: 'npx',
    args: ['@example/filesystem@1.2.3'],
    unpinned: false,
  });
});

it('pins an npm package from the fiche version when the package has none', () => {
  expect(
    proposeCommand({
      version: '2.0.0',
      packages: [pkg({ registryType: 'npm', identifier: '@example/filesystem', transport: 'stdio' })],
    }),
  ).toMatchObject({ command: 'npx', args: ['@example/filesystem@2.0.0'], unpinned: false });
});

it('prefers a pinned npm package over docker and a remote', () => {
  expect(
    proposeCommand({
      packages: [
        pkg({ registryType: 'docker', identifier: 'mcp/filesystem', version: '1.0.0', transport: 'stdio' }),
        pkg({ registryType: 'npm', identifier: '@example/filesystem', version: '1.2.3', transport: 'stdio' }),
      ],
      remotes: [http],
    }),
  ).toMatchObject({ runtime: 'npm', args: ['@example/filesystem@1.2.3'] });
});

it('proposes a pinned docker image', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'docker', identifier: 'mcp/filesystem', version: '1.2.3', transport: 'stdio' })],
    }),
  ).toEqual({
    kind: 'stdio',
    runtime: 'docker',
    command: 'docker',
    args: ['run', '-i', '--rm', 'mcp/filesystem:1.2.3'],
    unpinned: false,
  });
});

it('keeps a docker tag that is already on the image', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'docker', identifier: 'mcp/filesystem:1.2.3', transport: 'stdio' })],
    }),
  ).toMatchObject({ runtime: 'docker', args: ['run', '-i', '--rm', 'mcp/filesystem:1.2.3'], unpinned: false });
});

it('proposes a pinned OCI image with the docker runner', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'oci', identifier: 'ghcr.io/example/filesystem', version: '1.2.3', transport: 'stdio' })],
    }),
  ).toEqual({
    kind: 'stdio',
    runtime: 'oci',
    command: 'docker',
    args: ['run', '-i', '--rm', 'ghcr.io/example/filesystem:1.2.3'],
    unpinned: false,
  });
});

it('prefers docker over a pinned PyPI package and a remote', () => {
  expect(
    proposeCommand({
      packages: [
        pkg({ registryType: 'pypi', identifier: 'example-filesystem', version: '1.2.3', transport: 'stdio' }),
        pkg({ registryType: 'docker', identifier: 'mcp/filesystem:1', transport: 'stdio' }),
      ],
      remotes: [http],
    }),
  ).toMatchObject({ runtime: 'docker' });
});

it('proposes a pinned PyPI package', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'pypi', identifier: 'example-filesystem', version: '1.2.3', transport: 'stdio' })],
    }),
  ).toEqual({
    kind: 'stdio',
    runtime: 'pypi',
    command: 'uvx',
    args: ['example-filesystem==1.2.3'],
    unpinned: false,
  });
});

it('prefers a pinned PyPI package over a remote', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'pypi', identifier: 'example-filesystem', version: '1.2.3', transport: 'stdio' })],
      remotes: [http, sse],
    }),
  ).toMatchObject({ runtime: 'pypi' });
});

it('proposes a streamable-http remote ahead of SSE', () => {
  expect(proposeCommand({ remotes: [sse, http] })).toEqual({
    kind: 'remote',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    unpinned: false,
  });
});

it('proposes SSE when it is the only remote', () => {
  expect(proposeCommand({ remotes: [sse] })).toEqual({
    kind: 'remote',
    transport: 'sse',
    url: 'https://example.com/sse',
    unpinned: false,
  });
});

it('prefers a remote over an unpinned npm package', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'npm', identifier: '@example/filesystem', transport: 'stdio' })],
      remotes: [http],
    }),
  ).toMatchObject({ kind: 'remote', transport: 'streamable-http' });
});

it('flags an unpinned npx -y only when the fiche has no version', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'npm', identifier: '@example/filesystem', transport: 'stdio' })],
    }),
  ).toEqual({
    kind: 'stdio',
    runtime: 'npm',
    command: 'npx',
    args: ['-y', '@example/filesystem'],
    unpinned: true,
  });
});

it('flags an unpinned uvx only when the fiche has no version', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'pypi', identifier: 'example-filesystem', transport: 'stdio' })],
    }),
  ).toEqual({
    kind: 'stdio',
    runtime: 'pypi',
    command: 'uvx',
    args: ['example-filesystem'],
    unpinned: true,
  });
});

it('skips an image that has neither a tag nor a version', () => {
  expect(
    proposeCommand({
      packages: [pkg({ registryType: 'docker', identifier: 'mcp/filesystem', transport: 'stdio' })],
      remotes: [sse],
    }),
  ).toMatchObject({ kind: 'remote', transport: 'sse' });
});

it('throws when nothing can be installed', () => {
  expect(() => proposeCommand({})).toThrow(CommandError);
  expect(() =>
    proposeCommand({
      packages: [pkg({ registryType: 'docker', identifier: 'mcp/filesystem', transport: 'stdio' })],
    }),
  ).toThrow(CommandError);
});
