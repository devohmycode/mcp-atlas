import type { Origin, RawServer } from './types.js';

/** One catalog upstream. `origin` is the name stored on each raw server. */
export interface Source {
  readonly origin: Origin;
  fetch(): Promise<RawServer[]>;
}
