// A small PDF writer: one JPEG image and a few lines of text per page, in the
// PDF 1.4 format (ISO 32000-1 describes the same objects). Enough for exported
// diagram pages, and it keeps the export free of a PDF library.
//
//   1 Catalog → 2 Pages → page objects; 3 the Helvetica font (one of the
//   standard 14 fonts, so nothing is embedded); 4 document information;
//   then per page: the page, its content stream and its image (DCTDecode,
//   the JPEG bytes as they are).
//
// Coordinates are given in CSS pixels from the top-left corner and converted
// to PDF points (72 per inch, 96 CSS pixels per inch) from the bottom-left.

export interface PdfImage {
  /** JPEG file bytes. */
  readonly jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface PdfText {
  /** Left of the text and its baseline, in CSS pixels from the page's top-left. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly text: string;
  /** Right-aligns the text at x (approximate Helvetica widths). */
  readonly alignRight?: boolean;
  /** Grey level of the text, 0 (black) to 1 (white); default 0.35. */
  readonly shade?: number;
}

export interface PdfPage {
  /** Page size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Drawn over the whole page. */
  readonly image: PdfImage;
  readonly texts: readonly PdfText[];
}

export const POINTS_PER_PX = 72 / 96;

const encoder = new TextEncoder();
const ascii = (text: string): Uint8Array => encoder.encode(text);
const pt = (px: number): string => String(Math.round(px * POINTS_PER_PX * 100) / 100);

/** Text for a literal string in WinAnsi: printable ASCII only, with (, ) and \ escaped. */
export function pdfLiteral(text: string): string {
  return `(${text.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1")})`;
}

/** Any Unicode text as a UTF-16BE hex string, for document information. */
export function pdfUnicode(text: string): string {
  let hex = "FEFF";
  for (let index = 0; index < text.length; index += 1)
    hex += text.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/** Average Helvetica advance width (in em) used for right alignment. */
const HELVETICA_EM = 0.52;

function contentStream(page: PdfPage): string {
  const lines = [`q ${pt(page.width)} 0 0 ${pt(page.height)} 0 0 cm /Im Do Q`];
  for (const text of page.texts) {
    const x = text.alignRight ? text.x - text.text.length * text.size * HELVETICA_EM : text.x;
    const shade = String(Math.round((text.shade ?? 0.35) * 100) / 100);
    lines.push(
      `BT /F1 ${pt(text.size)} Tf ${shade} ${shade} ${shade} rg ${pt(x)} ${pt(page.height - text.y)} Td ${pdfLiteral(text.text)} Tj ET`,
    );
  }
  return lines.join("\n");
}

/** A readable grey for small text on a background with these 0–255 channels: dark text on light pages, light on dark. */
export function textShadeFor({ r, g, b }: { r: number; g: number; b: number }): number {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5 ? 0.35 : 0.75;
}

export function buildPdf(pages: readonly PdfPage[], { title }: { title: string }): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? ascii(part) : part;
    chunks.push(bytes);
    size += bytes.length;
  };
  const object = (id: number, body: string) => {
    offsets[id] = size;
    write(`${String(id)} 0 obj\n${body}\nendobj\n`);
  };
  const stream = (id: number, dictionary: string, data: Uint8Array) => {
    offsets[id] = size;
    write(`${String(id)} 0 obj\n<< ${dictionary} /Length ${String(data.length)} >>\nstream\n`);
    write(data);
    write("\nendstream\nendobj\n");
  };

  const pageIds = pages.map((_, index) => 5 + index * 3);
  const count = 4 + pages.length * 3;
  // The comment of four high bytes tells readers the file contains binary data.
  write("%PDF-1.4\n%");
  write(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(" ")}] /Count ${String(pages.length)} >>`,
  );
  object(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  object(4, `<< /Title ${pdfUnicode(title)} /Producer (Live Canvas) >>`);
  pages.forEach((page, index) => {
    const id = pageIds[index] ?? 0;
    object(
      id,
      [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(page.width)} ${pt(page.height)}]`,
        `/Resources << /Font << /F1 3 0 R >> /XObject << /Im ${String(id + 2)} 0 R >> >>`,
        `/Contents ${String(id + 1)} 0 R >>`,
      ].join(" "),
    );
    stream(id + 1, "", ascii(contentStream(page)));
    stream(
      id + 2,
      [
        `/Type /XObject /Subtype /Image /Width ${String(page.image.pixelWidth)} /Height ${String(page.image.pixelHeight)}`,
        "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode",
      ].join(" "),
      page.image.jpeg,
    );
  });

  const xref = size;
  const entries = Array.from(
    { length: count },
    (_, index) => `${String(offsets[index + 1] ?? 0).padStart(10, "0")} 00000 n \n`,
  );
  write(`xref\n0 ${String(count + 1)}\n0000000000 65535 f \n${entries.join("")}`);
  write(`trailer\n<< /Size ${String(count + 1)} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
