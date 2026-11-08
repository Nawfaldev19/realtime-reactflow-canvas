import { describe, expect, it } from "vitest";
import { fontUrls, inlineFonts, latinFaces } from "./fonts";

const SHEET = `
/* cyrillic */
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  src: url(https://fonts.example/inter-cyrillic.woff2) format('woff2');
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  src: url(https://fonts.example/inter-latin.woff2) format('woff2');
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-weight: 600;
  src: url("https://fonts.example/inter-latin.woff2") format('woff2');
}
/* latin-ext */
@font-face {
  font-family: 'Fraunces';
  src: url(https://fonts.example/fraunces-ext.woff2) format('woff2');
}
`;

describe("export fonts", () => {
  it("keeps only the Latin subsets", () => {
    const faces = latinFaces(SHEET);
    expect(faces).toHaveLength(2);
    expect(faces.every((face) => face.includes("inter-latin"))).toBe(true);
  });

  it("keeps every rule of a stylesheet without subset comments", () => {
    expect(
      latinFaces("@font-face { font-family: A; src: url(a.woff2); } @font-face { font-family: B; src: url(b.woff2); }"),
    ).toHaveLength(2);
    expect(latinFaces("body { color: red; }")).toEqual([]);
  });

  it("lists each font file once, quoted or not", () => {
    expect(fontUrls(latinFaces(SHEET))).toEqual(["https://fonts.example/inter-latin.woff2"]);
  });

  it("inlines the font files it has and leaves the others", () => {
    const faces = latinFaces(SHEET);
    const css = inlineFonts(
      faces,
      new Map([["https://fonts.example/inter-latin.woff2", "data:font/woff2;base64,AAAA"]]),
    );
    expect(css.match(/url\(data:font\/woff2;base64,AAAA\)/g)).toHaveLength(2);
    expect(inlineFonts(["@font-face { src: url(other.woff2); }"], new Map())).toBe(
      "@font-face { src: url(other.woff2); }",
    );
  });
});
