const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;
const DURATION = /^([1-9][0-9]{0,5})(s|m|h|d)$/;

/**
 * "90s" | "15m" | "8h" | "7d" -> seconds. Returns undefined for anything else, or when the
 * result is outside [minSeconds, maxSeconds].
 */
export function parseDurationSeconds(
  raw: string,
  minSeconds: number,
  maxSeconds: number,
): number | undefined {
  const match = DURATION.exec(raw.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
  return seconds >= minSeconds && seconds <= maxSeconds ? seconds : undefined;
}
