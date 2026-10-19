/** Thrown when an upstream page is not the shape frozen in the fixture. */
export class ContractError extends Error {
  readonly name = 'ContractError';
  constructor(source: string, detail: string) {
    super(`Le contrat a bougé (${source}): ${detail}`);
  }
}

export function asRecord(value: unknown, source: string, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContractError(source, `${where} n'est pas un objet`);
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown, source: string, where: string): unknown[] {
  if (!Array.isArray(value)) throw new ContractError(source, `${where} n'est pas un tableau`);
  return value;
}

export function requiredString(value: unknown, source: string, where: string): string {
  if (typeof value !== 'string' || value === '') throw new ContractError(source, `${where} manque`);
  return value;
}

/** Absent is fine. A present value of the wrong type means the contract moved. */
export function optionalString(value: unknown, source: string, where: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ContractError(source, `${where} n'est pas une chaîne`);
  return value || undefined;
}
