/** WCAG 2.x colour helpers — used to keep themed buttons readable (docs/05-design-system.md). */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHex(hex: string): [number, number, number] | null {
  const match = HEX.exec(hex.trim());
  if (!match) return null;
  let value = match[1]!;
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`Invalid hex colour: ${hex}`);
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

export const TEXT_ON_LIGHT = "#1a1a24";
export const TEXT_ON_DARK = "#ffffff";

/** White or near-black, whichever reads better on `background`. */
export function readableTextColor(background: string): string {
  return contrastRatio(background, TEXT_ON_DARK) >= contrastRatio(background, TEXT_ON_LIGHT)
    ? TEXT_ON_DARK
    : TEXT_ON_LIGHT;
}
