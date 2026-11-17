/** Strict route-parameter parsing: plain digits within range, anything else -> null (404). */
export function parseIntParam(raw: string | string[] | undefined, min: number, max: number): number | null {
  if (typeof raw !== 'string' || !/^[0-9]{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/** ?page= for listing pages: missing -> 1, invalid -> null (404). */
export function parsePageParam(raw: string | string[] | undefined): number | null {
  return raw === undefined ? 1 : parseIntParam(raw, 1, 10_000);
}
