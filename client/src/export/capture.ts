import { toCanvas } from "html-to-image";
import type { DocumentState } from "../document/types";
import { parseColor } from "../geometry/guides";
import type { Box } from "../geometry/vector";
import { diagramBounds } from "../viewport/bounds";
import type { Orientation, Paper } from "./pagination";
import { fontUrls, inlineFonts, latinFaces } from "./fonts";
import { PAGE_LAYOUT } from "./pagination";
import { buildPdf, textShadeFor, type PdfPage } from "./pdf";
import { exportArea, generatedStamp, planPdf, withinBudget } from "./plan";

// Rasterising the canvas for export. Adapted from the React Flow "Download
// Image" example (MIT): the canvas library's viewport element (nodes, the
// connector SVG and the label layer) is drawn into a canvas by html-to-image
// (MIT), with a transform that puts the requested area of the diagram at the
// image's top-left corner. Each PDF page is captured separately, so no single
// canvas gets too large. The page footer is real PDF text from our own
// writer (pdf.ts).

export class ExportError extends Error {}

/** Elements left out of every capture: the minimap, connection ports, resize handles, and anything marked data-export="skip". */
function keep(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  if (node instanceof HTMLElement && node.dataset.export === "skip") return false;
  return !["react-flow__minimap", "react-flow__handle", "react-flow__resize-control", "node-handle"].some((name) =>
    node.classList.contains(name),
  );
}

const asDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL always produces a string.
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new ExportError("A font could not be read."));
    };
    reader.readAsDataURL(blob);
  });

async function fetchFontCss(): Promise<string> {
  const sheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).filter(
    (link) => new URL(link.href).origin !== window.location.origin,
  );
  const css = await Promise.all(sheets.map(async (link) => (await fetch(link.href)).text()));
  const faces = latinFaces(css.join("\n"));
  const files = await Promise.all(
    fontUrls(faces).map(async (url) => [url, await asDataUrl(await (await fetch(url)).blob())] as const),
  );
  return inlineFonts(faces, new Map(files));
}

// Web fonts are fetched once per page load and reused for every capture. When
// they cannot be fetched (offline), exports use the fallback fonts of the font
// stacks rather than failing.
let fontCss: Promise<string> | null = null;
const embeddedFonts = (): Promise<string> => (fontCss ??= fetchFontCss().catch(() => ""));

async function captureArea(
  viewport: HTMLElement,
  area: Box,
  scale: number,
  pixelRatio: number,
  background: string,
): Promise<HTMLCanvasElement> {
  const width = Math.ceil(area.width * scale);
  const height = Math.ceil(area.height * scale);
  if (!withinBudget(width, height, pixelRatio))
    throw new ExportError("This diagram is too large for that quality. Choose a lower quality and try again.");
  const css = await embeddedFonts();
  return toCanvas(viewport, {
    width,
    height,
    pixelRatio,
    backgroundColor: background,
    filter: keep,
    fontEmbedCSS: css,
    skipFonts: css === "",
    style: {
      width: `${String(width)}px`,
      height: `${String(height)}px`,
      transform: `translate(${String(-area.x * scale)}px, ${String(-area.y * scale)}px) scale(${String(scale)})`,
    },
  });
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ExportError("The browser could not encode the image."))),
      type,
      quality,
    );
  });

/** The canvas library's viewport element inside a canvas root, and the background colour the canvas shows. */
export function captureSource(root: HTMLElement | null): { viewport: HTMLElement; background: string } {
  const viewport = root?.querySelector<HTMLElement>(".react-flow__viewport");
  if (!root || !viewport) throw new ExportError("The canvas is not ready yet.");
  const background =
    getComputedStyle(root).getPropertyValue("--xy-background-color").trim() ||
    getComputedStyle(root).backgroundColor ||
    "#ffffff";
  return { viewport, background };
}

export interface ExportRequest {
  readonly root: HTMLElement | null;
  readonly doc: DocumentState;
  /** Capture resolution multiplier, 1–4. */
  readonly quality: number;
}

/** The whole diagram as one PNG at the diagram's own size times the quality. */
export async function exportPng({ root, doc, quality }: ExportRequest): Promise<Blob> {
  const area = exportArea(diagramBounds(doc));
  if (!area) throw new ExportError("There is nothing to export yet.");
  const { viewport, background } = captureSource(root);
  return toBlob(await captureArea(viewport, area, 1, quality, background), "image/png");
}

export interface PdfRequest extends ExportRequest {
  readonly title: string;
  readonly paper: Paper;
  readonly orientation: Orientation;
  readonly pageNumbers: boolean;
  readonly onProgress?: (page: number, pages: number) => void;
  readonly now?: Date;
}

/** One PDF page per slice of the plan, each a JPEG of the page plus the footer stamp and "Page n of N". */
export async function exportPdf({
  root,
  doc,
  quality,
  title,
  paper,
  orientation,
  pageNumbers,
  onProgress,
  now = new Date(),
}: PdfRequest): Promise<Blob> {
  const plan = planPdf(doc, paper, orientation);
  if (!plan) throw new ExportError("There is nothing to export yet.");
  const { viewport, background } = captureSource(root);
  const { padding } = PAGE_LAYOUT;
  const total = plan.slices.length;
  const color = parseColor(background) ?? { r: 255, g: 255, b: 255 };
  const shade = textShadeFor(color);
  const stamp = generatedStamp(now);
  const pages: PdfPage[] = [];
  for (const [index, slice] of plan.slices.entries()) {
    onProgress?.(index + 1, total);
    const part = {
      x: plan.area.x,
      y: plan.area.y + slice.top / plan.scale,
      width: plan.area.width,
      height: (slice.bottom - slice.top) / plan.scale,
    };
    const image = await captureArea(viewport, part, plan.scale, quality, background);
    const sheet = document.createElement("canvas");
    sheet.width = Math.round(plan.page.width * quality);
    sheet.height = Math.round(plan.page.height * quality);
    const context = sheet.getContext("2d");
    if (!context) throw new ExportError("The browser could not draw the page.");
    context.fillStyle = background;
    context.fillRect(0, 0, sheet.width, sheet.height);
    context.drawImage(image, Math.round((padding + plan.offsetX) * quality), Math.round(padding * quality));
    const jpeg = new Uint8Array(await (await toBlob(sheet, "image/jpeg", 0.92)).arrayBuffer());
    const baseline = plan.page.height - padding - 12;
    pages.push({
      width: plan.page.width,
      height: plan.page.height,
      image: { jpeg, pixelWidth: sheet.width, pixelHeight: sheet.height },
      texts: [
        { x: padding, y: baseline, size: 9, text: stamp, shade },
        ...(pageNumbers
          ? [
              {
                x: plan.page.width - padding,
                y: baseline,
                size: 9,
                text: `Page ${String(index + 1)} of ${String(total)}`,
                alignRight: true,
                shade,
              },
            ]
          : []),
      ],
    });
  }
  return new Blob([buildPdf(pages, { title })], { type: "application/pdf" });
}

/** Saves a blob through a temporary link. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
