import type { PackageRef, RemoteRef } from './types.js';

export class CommandError extends Error {
  readonly name = 'CommandError';
  constructor(message: string) {
    super(message);
  }
}

export type ProposedCommand =
  | {
      kind: 'stdio';
      runtime: 'npm' | 'docker' | 'oci' | 'pypi';
      command: string;
      args: string[];
      /** True only for `npx -y` or `uvx` with no version. */
      unpinned: boolean;
    }
  | {
      kind: 'remote';
      transport: 'streamable-http' | 'sse';
      url: string;
      unpinned: false;
    };

interface CommandInput {
  version?: string;
  packages?: PackageRef[];
  remotes?: RemoteRef[];
}

/**
 * Picks one install line from packages and remotes. Nothing is executed.
 * Order: pinned npm, Docker or OCI image, pinned PyPI, streamable HTTP, SSE,
 * then an unpinned `npx -y` or `uvx` when the fiche has no version.
 */
export function proposeCommand(input: CommandInput): ProposedCommand {
  const packages = input.packages ?? [];
  const remotes = input.remotes ?? [];
  const pinnedNpm = packages.find((pkg) => isNpm(pkg) && pin(pkg, input.version));
  if (pinnedNpm) {
    const version = pin(pinnedNpm, input.version)!;
    return { kind: 'stdio', runtime: 'npm', command: 'npx', args: [`${pinnedNpm.identifier}@${version}`], unpinned: false };
  }
  const image = packages.find((pkg) => (isDocker(pkg) || isOci(pkg)) && imageRef(pkg, input.version));
  if (image) {
    const ref = imageRef(image, input.version)!;
    return {
      kind: 'stdio',
      runtime: isDocker(image) ? 'docker' : 'oci',
      command: 'docker',
      args: ['run', '-i', '--rm', ref],
      unpinned: false,
    };
  }
  const pinnedPy = packages.find((pkg) => isPy(pkg) && pin(pkg, input.version));
  if (pinnedPy) {
    const version = pin(pinnedPy, input.version)!;
    return { kind: 'stdio', runtime: 'pypi', command: 'uvx', args: [`${pinnedPy.identifier}==${version}`], unpinned: false };
  }
  const http = remotes.find((remote) => remote.type === 'streamable-http');
  if (http) return { kind: 'remote', transport: 'streamable-http', url: http.url, unpinned: false };
  const sse = remotes.find((remote) => remote.type === 'sse');
  if (sse) return { kind: 'remote', transport: 'sse', url: sse.url, unpinned: false };
  const looseNpm = packages.find((pkg) => isNpm(pkg) && !pin(pkg, input.version));
  if (looseNpm) return { kind: 'stdio', runtime: 'npm', command: 'npx', args: ['-y', looseNpm.identifier], unpinned: true };
  const loosePy = packages.find((pkg) => isPy(pkg) && !pin(pkg, input.version));
  if (loosePy) return { kind: 'stdio', runtime: 'pypi', command: 'uvx', args: [loosePy.identifier], unpinned: true };
  throw new CommandError('No package or remote to install');
}

function isNpm(pkg: PackageRef): boolean {
  return pkg.registryType === 'npm';
}

function isDocker(pkg: PackageRef): boolean {
  return pkg.registryType === 'docker';
}

function isOci(pkg: PackageRef): boolean {
  return pkg.registryType === 'oci';
}

function isPy(pkg: PackageRef): boolean {
  return pkg.registryType === 'pypi';
}

/** Package version, otherwise the fiche version. Absent means unpinned. */
function pin(pkg: PackageRef, ficheVersion: string | undefined): string | undefined {
  return pkg.version || ficheVersion;
}

/** Image reference. A tag already in the identifier counts. Without a version, skip. */
function imageRef(pkg: PackageRef, ficheVersion: string | undefined): string | undefined {
  const slash = pkg.identifier.lastIndexOf('/');
  const tail = slash === -1 ? pkg.identifier : pkg.identifier.slice(slash + 1);
  if (tail.includes(':')) return pkg.identifier;
  const version = pin(pkg, ficheVersion);
  return version ? `${pkg.identifier}:${version}` : undefined;
}
