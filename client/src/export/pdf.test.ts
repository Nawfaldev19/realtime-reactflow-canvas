import { describe, expect, it } from "vitest";
import { buildPdf, pdfLiteral, pdfUnicode, POINTS_PER_PX, textShadeFor, type PdfPage } from "./pdf";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const decoder = new TextDecoder("latin1");

function page(n: number, of: number): PdfPage {
  return {
    width: 816,
    height: 1056,
    image: { jpeg: JPEG, pixelWidth: 1632, pixelHeight: 2112 },
    texts: [
      { x: 30, y: 1030, size: 10, text: "Generated on 17 Oct 2026" },
      { x: 786, y: 1030, size: 10, text: `Page ${String(n)} of ${String(of)}`, alignRight: true, shade: 0.75 },
    ],
  };
}

describe("PDF writer", () => {
  const pages = [page(1, 3), page(2, 3), page(3, 3)];
  const bytes = buildPdf(pages, { title: "Walnut table – plan" });
  const text = decoder.decode(bytes);

  it("writes a PDF 1.4 file with one page object per page", () => {
    expect(text.startsWith("%PDF-1.4\n%")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text.match(/\/Type \/Page /g)).toHaveLength(3);
    expect(text).toContain("/Count 3");
  });

  it("points every cross-reference entry at its object", () => {
    const start = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const entries = text
      .slice(start)
      .split("\n")
      .slice(3)
      .filter((line) => / 00000 n $/.test(line));
    expect(entries).toHaveLength(4 + 3 * 3);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + 12).startsWith(`${String(index + 1)} 0 obj`)).toBe(true);
    });
    expect(text).toContain(`/Size ${String(4 + 3 * 3 + 1)}`);
  });

  it("embeds the JPEG unchanged with its stated length and pixel size", () => {
    expect(text).toContain("/Width 1632 /Height 2112");
    expect(text).toContain(`/Length ${String(JPEG.length)} >>\nstream\n${decoder.decode(JPEG)}\nendstream`);
  });

  it("draws the image over the page and the page numbers in points from the bottom", () => {
    // 816 × 1056 px = 612 × 792 pt.
    expect(text).toContain("/MediaBox [0 0 612 792]");
    expect(text).toContain("q 612 0 0 792 0 0 cm /Im Do Q");
    expect(text).toContain("(Page 2 of 3) Tj");
    expect(text).toContain("0.75 0.75 0.75 rg");
    expect(text).toContain("0.35 0.35 0.35 rg");
    expect(text).toContain(
      `${String(30 * POINTS_PER_PX)} ${String(26 * POINTS_PER_PX)} Td (Generated on 17 Oct 2026) Tj`,
    );
  });

  it("stores the title as Unicode", () => {
    expect(text).toContain(`/Title ${pdfUnicode("Walnut table – plan")}`);
  });

  it("escapes literal strings and replaces characters outside printable ASCII", () => {
    expect(pdfLiteral("a (b) \\ c")).toBe("(a \\(b\\) \\\\ c)");
    expect(pdfLiteral("Été")).toBe("(?t?)");
    expect(pdfUnicode("Aé")).toBe("<FEFF004100E9>");
  });

  it("picks dark text for light pages and light text for dark ones", () => {
    expect(textShadeFor({ r: 250, g: 247, b: 242 })).toBe(0.35);
    expect(textShadeFor({ r: 28, g: 27, b: 25 })).toBe(0.75);
  });

  it("writes an empty page tree for no pages", () => {
    const empty = decoder.decode(buildPdf([], { title: "" }));
    expect(empty).toContain("/Kids [] /Count 0");
  });
});
