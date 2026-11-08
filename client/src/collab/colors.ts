import { fnv1a } from "../routing/ids";

// A collaborator's colour, derived from their stable member id, so it is the
// same on every screen, after every reload and on every device.
//
// 1. Hue from a 32-bit FNV-1a hash of the id: hue = hash mod 360, saturation
//    65%, lightness 50% (the starting point).
// 2. Contrast check: the cursor, the name tag and the badge sit on the canvas
//    in both themes, so the colour's relative luminance is moved into the band
//    where it has at least 3:1 contrast (WCAG non-text contrast) against both
//    canvas backgrounds, by adjusting lightness only (the hue stays).
// 3. Tag text is black or white, whichever reads better: black when the
//    luminance is above 0.179, the point where both give the same contrast.
//    Inside the band that is always at least 4.5:1 (WCAG AA for text).

export const LIGHT_CANVAS = "#faf7f2";
export const DARK_CANVAS = "#1c1b19";
export const MIN_GRAPHIC_CONTRAST = 3;
export const SATURATION = 65;
export const LIGHTNESS = 50;
export const TEXT_THRESHOLD = 0.179;

export interface MemberColor {
  /** "#rrggbb" */
  readonly color: string;
  /** "#000000" or "#ffffff" */
  readonly text: string;
}

const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value * 255)));
const hex2 = (value: number) => channel(value).toString(16).padStart(2, "0");

/** HSL (degrees, percent, percent) to "#rrggbb". */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${hex2(f(0))}${hex2(f(8))}${hex2(f(4))}`;
}

const linear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** Relative luminance of "#rrggbb": Y = 0.2126 R + 0.7152 G + 0.0722 B over linearized sRGB channels. */
export function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((part) => linear(part / 255)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Black or white, whichever is more readable on `background`. */
export function readableText(background: string): string {
  return relativeLuminance(background) > TEXT_THRESHOLD ? "#000000" : "#ffffff";
}

/** The luminance band with at least 3:1 contrast against both canvas backgrounds. */
export function luminanceBand(
  light = LIGHT_CANVAS,
  dark = DARK_CANVAS,
  ratio = MIN_GRAPHIC_CONTRAST,
): { min: number; max: number } {
  return {
    min: ratio * (relativeLuminance(dark) + 0.05) - 0.05,
    max: (relativeLuminance(light) + 0.05) / ratio - 0.05,
  };
}

// A small margin keeps rounding to whole channel values inside the band.
const BAND = (() => {
  const { min, max } = luminanceBand();
  return { min: min + 0.005, max: max - 0.005 };
})();

/** The lightness (percent) at which the colour's luminance reaches `target`; luminance grows with lightness. */
function lightnessFor(hue: number, target: number): number {
  let low = 0;
  let high = 100;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (relativeLuminance(hslToHex(hue, SATURATION, middle)) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** The colour of a member, stable for their id and readable on both canvas themes. */
export function memberColor(memberId: string): MemberColor {
  const hue = fnv1a(memberId) % 360;
  let color = hslToHex(hue, SATURATION, LIGHTNESS);
  const luminance = relativeLuminance(color);
  if (luminance < BAND.min) color = hslToHex(hue, SATURATION, lightnessFor(hue, BAND.min));
  else if (luminance > BAND.max) color = hslToHex(hue, SATURATION, lightnessFor(hue, BAND.max));
  return { color, text: readableText(color) };
}
