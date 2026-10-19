import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readConfigFile, renderConfig, renderWithout } from './mcp-config.js';
import type { FilePlan } from './plan.js';

export interface Removal {
  path: string;
  format: 'json' | 'toml';
  key: string;
}

export interface ApplyResult {
  path: string;
  written: boolean;
  collision: boolean;
  dryRun: boolean;
}

export interface ApplyOptions {
  dryRun?: boolean;
  log?: (line: string) => void;
}

/**
 * Writes one plan. The live file is read again: a key that is already there is
 * skipped, not overwritten. `--dry-run` prints the body and creates nothing.
 */
export async function applyPlan(plan: FilePlan, opts: ApplyOptions = {}): Promise<ApplyResult> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const file = readConfigFile(plan.format, await readLive(plan.path), plan.path);
  if (Object.hasOwn(file.servers, plan.key)) {
    log(`skip ${plan.path}: ${plan.key} already exists`);
    return { path: plan.path, written: false, collision: true, dryRun: opts.dryRun === true };
  }
  const body = renderConfig(plan.format, file, plan.key, plan.entry);
  if (opts.dryRun === true) {
    log(`dry-run ${plan.path}`);
    log(body);
    return { path: plan.path, written: false, collision: false, dryRun: true };
  }
  await replaceFile(plan.path, body);
  return { path: plan.path, written: true, collision: false, dryRun: false };
}

/**
 * Removes one key. The rest of the file stays. Same temporary file, backup, and
 * dry-run as an install: dry-run prints the result and creates nothing.
 */
export async function applyRemoval(removal: Removal, opts: ApplyOptions = {}): Promise<ApplyResult> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const file = readConfigFile(removal.format, await readLive(removal.path), removal.path);
  if (!Object.hasOwn(file.servers, removal.key)) {
    log(`skip ${removal.path}: ${removal.key} is not installed`);
    return { path: removal.path, written: false, collision: false, dryRun: opts.dryRun === true };
  }
  const body = renderWithout(removal.format, file, removal.key);
  if (opts.dryRun === true) {
    log(`dry-run ${removal.path}`);
    log(body);
    return { path: removal.path, written: false, collision: false, dryRun: true };
  }
  await replaceFile(removal.path, body);
  return { path: removal.path, written: true, collision: false, dryRun: false };
}

async function readLive(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/**
 * Writes `path.tmp`, then renames it into place. Windows rename does not replace
 * an existing file, so the previous bytes are copied to `path.bak`, the destination
 * is removed, and the temporary file is renamed. A failure removes the temporary file.
 */
async function replaceFile(path: string, body: string): Promise<void> {
  const tmp = `${path}.tmp`;
  const bak = `${path}.bak`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmp, body);
  try {
    if (existsSync(path)) {
      await copyFile(path, bak);
      await rm(path);
    }
    try {
      await rename(tmp, path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EEXIST') throw err;
      if (existsSync(path)) {
        await copyFile(path, bak);
        await rm(path);
      }
      await rename(tmp, path);
    }
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
