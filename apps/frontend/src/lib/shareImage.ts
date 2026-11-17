/** Layout rules for the "share as image" card (spec 4.4), kept pure for tests. */

export const SHARE_CARD_WIDTH = 1080;
/** Output pixels = CSS pixels x this (2160 px wide PNG). */
export const SHARE_PIXEL_RATIO = 2;

/**
 * Ayah font size for the card: long ayahs get smaller text. The card height is automatic, so
 * even the longest ayah (2:282) wraps fully instead of being clipped.
 */
export function shareFontSize(text: string): number {
  const n = [...text].length;
  if (n <= 80) return 64;
  if (n <= 200) return 54;
  if (n <= 450) return 44;
  if (n <= 800) return 36;
  return 30;
}

export function shareFileName(suraNumber: number, ayahNumber: number): string {
  return `quran-${suraNumber}-${ayahNumber}.png`;
}
