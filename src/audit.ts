import { CommandError, proposeCommand } from './command.js';
import { assessRisks, type Risk } from './risk.js';
import type { Server } from './types.js';

export type AuditStatus = 'pass' | 'fail' | 'unaudited';

export interface AuditResult {
  id: string;
  /**
   * `fail` when a high risk was found. `unaudited` when the command could not
   * be read: that is not a failure. `pass` otherwise, info and medium included.
   */
  status: AuditStatus;
  risks: Risk[];
  /** Set when `status` is `unaudited`. */
  reason?: string;
}

type AuditedServer = Pick<Server, 'id' | 'version' | 'packages' | 'remotes' | 'repository'>;

/** Reads the proposed command and its risks. Nothing is executed. */
export function auditServer(server: AuditedServer): AuditResult {
  try {
    const command = proposeCommand(server);
    const risks = assessRisks({ command, repositoryUrl: server.repository?.url });
    return { id: server.id, status: risks.some((risk) => risk.level === 'high') ? 'fail' : 'pass', risks };
  } catch (err) {
    if (err instanceof CommandError) {
      return { id: server.id, status: 'unaudited', risks: [], reason: err.message };
    }
    throw err;
  }
}

/** A high risk fails the audit. An unreadable command does not. */
export function failsAudit(result: AuditResult): boolean {
  return result.status !== 'unaudited' && result.risks.some((risk) => risk.level === 'high');
}

/**
 * The audit runs unless this invocation passes `false` (`--no-audit`) or the
 * saved config has `audit: false`. On is the default, and a high risk then blocks.
 */
export function auditEnabled(config: { audit?: boolean } = {}, enabled?: boolean): boolean {
  return enabled !== false && config.audit !== false;
}

/** Whether an install may proceed. Refusal is the default. */
export function auditAllows(result: AuditResult, config: { audit?: boolean } = {}, enabled?: boolean): boolean {
  if (!auditEnabled(config, enabled)) return true;
  return !failsAudit(result);
}
