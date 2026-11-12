import type { TransformFnParams } from 'class-transformer';

const UINT = /^[0-9]{1,9}$/;

/**
 * Strict string -> integer for query/path params. Only plain digit strings convert; anything
 * else ("1.5", "1e2", " 1", "-1", "0x10", repeated params, ...) is returned unchanged so that
 * @IsInt() rejects it with a 400 instead of silently coercing it.
 */
export function toStrictInt({ value }: TransformFnParams): unknown {
  return typeof value === 'string' && UINT.test(value) ? Number(value) : value;
}

/**
 * "1,4,1" -> [1, 4] (deduplicated, order kept). Returns the raw value unchanged when any item
 * is not a plain digit string, so @IsInt({ each: true }) / @IsArray() reject it with a 400.
 */
export function toIntList({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const parts = value.split(',');
  if (!parts.every((p) => UINT.test(p))) return value;
  return [...new Set(parts.map(Number))];
}

/** "true" / "false" -> boolean; anything else unchanged so @IsBoolean() rejects it. */
export function toStrictBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
