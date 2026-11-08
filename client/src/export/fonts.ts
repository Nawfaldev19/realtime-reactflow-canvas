// Web fonts for exported images. An exported image is drawn from an SVG that
// is rendered on its own, without the page's fonts, so the @font-face rules
// must travel inside it with the font files inlined as data URLs. The font
// stylesheet comes from another origin, so its rules cannot be read through
// the CSSOM; it is fetched as text instead (the font service allows that).
// Only the Latin subsets are kept: the demo's text is Latin, and every other
// subset would add a font file to every export.

const FACE_WITH_SUBSET = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
const FACE = /@font-face\s*\{[^}]*\}/g;
const URL_PATTERN = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;

/** The @font-face rules to embed: those marked as the "latin" subset, or every rule when the stylesheet has no subset comments. */
export function latinFaces(css: string): string[] {
  const marked = [...css.matchAll(FACE_WITH_SUBSET)];
  if (marked.length === 0) return css.match(FACE) ?? [];
  return marked.filter((match) => match[1] === "latin").map((match) => match[2] ?? "");
}

/** The distinct font file URLs the rules refer to. */
export function fontUrls(faces: readonly string[]): string[] {
  return [...new Set(faces.flatMap((face) => [...face.matchAll(URL_PATTERN)].map((match) => match[1] ?? "")))];
}

/** The rules with every font URL replaced by its data URL (URLs without one are left as they are). */
export function inlineFonts(faces: readonly string[], dataUrls: ReadonlyMap<string, string>): string {
  return faces
    .map((face) =>
      face.replace(URL_PATTERN, (whole, url: string) =>
        dataUrls.has(url) ? `url(${dataUrls.get(url) ?? ""})` : whole,
      ),
    )
    .join("\n");
}
