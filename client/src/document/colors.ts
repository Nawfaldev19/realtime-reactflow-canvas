// Colour values a document may hold, and the group background rule.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(rgba?)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+|1\.0+)\s*)?\)$/i;

interface Parsed {
  readonly rgb: readonly [number, number, number];
  /** True when the colour carries its own alpha. */
  readonly hasAlpha: boolean;
}

function parse(value: string): Parsed | null {
  if (HEX.test(value)) {
    const body = value.slice(1);
    const short = body.length <= 4;
    const pairs = short
      ? Array.from({ length: body.length }, (_, index) => body.charAt(index).repeat(2))
      : (body.match(/../g) ?? []);
    const [r = "00", g = "00", b = "00"] = pairs;
    return { rgb: [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)], hasAlpha: pairs.length === 4 };
  }
  const match = FUNCTIONAL.exec(value);
  if (!match) return null;
  const [, name = "", r, g, b, alpha] = match;
  const rgb = [Number(r), Number(g), Number(b)] as const;
  const isRgba = name.toLowerCase() === "rgba";
  if (rgb.some((channel) => channel > 255) || isRgba !== (alpha !== undefined)) return null;
  return { rgb, hasAlpha: isRgba };
}

/** Hex (3, 4, 6 or 8 digits), rgb() or rgba(). The server accepts the same forms. */
export function isColor(value: unknown): value is string {
  return typeof value === "string" && parse(value) !== null;
}

/**
 * A group's background: hex or rgb() plus an opacity becomes rgba() with the
 * opacity clamped to [0, 1]; a colour that already carries alpha (rgba() or
 * 4/8-digit hex) is kept as it is. Anything else gives null (use the default).
 */
export function groupBackground(color: unknown, opacity: unknown): string | null {
  if (typeof color !== "string") return null;
  const parsed = parse(color);
  if (!parsed) return null;
  if (parsed.hasAlpha) return color;
  const alpha = typeof opacity === "number" && Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.5;
  const [r, g, b] = parsed.rgb;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}
