import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { ORIGINS, TRANSPORTS, type Catalog } from './types.js';

/** The snapshot failed the schema, or the file is truncated. `field` is the part at fault. */
export class CatalogShapeError extends Error {
  readonly name = 'CatalogShapeError';
  constructor(
    readonly field: string,
    detail: string,
  ) {
    super(`${field}: ${detail}`);
  }
}

const originSchema = z.enum(ORIGINS);
const transportSchema = z.enum(TRANSPORTS);

const catalogSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().min(1),
  themes: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      description: z.string().optional(),
    }),
  ),
  servers: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      title: z.string().optional(),
      description: z.string().optional(),
      version: z.string().optional(),
      repository: z.object({ url: z.string().min(1) }).optional(),
      packages: z.array(
        z.object({
          registryType: z.string().min(1),
          identifier: z.string().min(1),
          version: z.string().optional(),
          transport: transportSchema,
        }),
      ),
      remotes: z.array(
        z.object({
          type: z.enum(['sse', 'streamable-http']),
          url: z.string().min(1),
        }),
      ),
      origins: z.array(originSchema),
      themes: z.array(z.string()),
      official: z.boolean(),
      singleRegistry: z.boolean(),
    }),
  ),
  stats: z.object({
    raw: z.partialRecord(originSchema, z.number().int().nonnegative()),
    sources: z.partialRecord(
      originSchema,
      z.object({
        status: z.enum(['ok', 'error']),
        count: z.number().int().nonnegative(),
        error: z.string().optional(),
      }),
    ),
    merged: z.number().int().nonnegative(),
    official: z.number().int().nonnegative(),
    singleRegistry: z.number().int().nonnegative(),
    byTheme: z.record(z.string(), z.number().int().nonnegative()),
  }),
});

/** `data/catalog.json.gz` beside the package, or under the current directory. */
export function defaultCatalogPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, 'data', 'catalog.json.gz');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return join(process.cwd(), 'data', 'catalog.json.gz');
}

/** Checks a decoded snapshot. A missing or mistyped field is named on the error. */
export function parseCatalog(value: unknown): Catalog {
  const parsed = catalogSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue && issue.path.length > 0 ? issue.path.join('.') : 'catalog';
    throw new CatalogShapeError(field, issue?.message ?? 'invalid catalog');
  }
  return parsed.data;
}

/** Writes `data/catalog.json.gz` (or `path`) and refuses a snapshot the schema rejects. */
export async function saveCatalog(catalog: Catalog, path = defaultCatalogPath()): Promise<void> {
  const checked = parseCatalog(catalog);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, gzipSync(Buffer.from(JSON.stringify(checked))));
}

/** Reads gzip bytes and checks them. A truncated file names `catalog`. */
export function decodeCatalog(buf: Buffer): Catalog {
  let text: string;
  try {
    text = inflate(buf);
  } catch (err) {
    if (err instanceof CatalogShapeError) throw err;
    throw new CatalogShapeError('catalog', 'truncated snapshot');
  }
  try {
    return parseCatalog(JSON.parse(text) as unknown);
  } catch (err) {
    if (err instanceof CatalogShapeError) throw err;
    throw new CatalogShapeError('catalog', 'truncated snapshot');
  }
}

/** Reads a gzip snapshot and checks it. A truncated file names `catalog`. */
export async function loadCatalog(path = defaultCatalogPath()): Promise<Catalog> {
  return decodeCatalog(await readFile(path));
}

function inflate(buf: Buffer): string {
  if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
    throw new CatalogShapeError('catalog', 'truncated snapshot');
  }
  return gunzipSync(buf).toString('utf8');
}
