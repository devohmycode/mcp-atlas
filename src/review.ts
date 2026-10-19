import { auditServer, failsAudit } from './audit.js';
import { CommandError, proposeCommand } from './command.js';
import type { Risk } from './risk.js';
import type { Catalog, ClientId, Scope, Server } from './types.js';

export interface ReviewTarget {
  clients: readonly ClientId[];
  scope: Scope;
}

/** What the tree and the page show before anything is written. */
export interface ReviewItem {
  id: string;
  command: string;
  risks: Risk[];
  clients: readonly ClientId[];
  scope: Scope;
}

export function isHighRisk(server: Pick<Server, 'id' | 'version' | 'packages' | 'remotes' | 'repository'>): boolean {
  return failsAudit(auditServer(server));
}

export function commandText(server: Pick<Server, 'version' | 'packages' | 'remotes'>): string {
  try {
    const command = proposeCommand(server);
    if (command.kind === 'remote') return command.url;
    return [command.command, ...command.args].join(' ');
  } catch (err) {
    if (err instanceof CommandError) return err.message;
    throw err;
  }
}

export function reviewItems(catalog: Catalog, ids: readonly string[], target: ReviewTarget): ReviewItem[] {
  return ids.map((id) => {
    const server = catalog.servers.find((item) => item.id === id);
    if (!server) throw new Error(`Unknown server ${id}`);
    return {
      id,
      command: commandText(server),
      risks: auditServer(server).risks,
      clients: target.clients,
      scope: target.scope,
    };
  });
}
