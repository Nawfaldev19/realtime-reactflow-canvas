import type { DocumentState } from "../document/types";
import type { Box } from "../geometry/vector";
import { diagramBounds } from "../viewport/bounds";
import {
  documentUnits,
  pageFrame,
  pageSize,
  paginate,
  type Interval,
  type Orientation,
  type PageFrame,
  type PageSize,
  type Paper,
} from "./pagination";

// What an export captures and how it is laid out, from the document model:
// the diagram bounds plus a margin, the scale that fits the page width (never
// magnified), and the page slices. The dialog's page count and the file's
// "Page n of N" both come from here.

/** Canvas units of empty space around the diagram in every export. */
export const EXPORT_MARGIN = 40;
/** The largest canvas an export draws, in device pixels (browsers refuse much larger ones). */
export const PIXEL_BUDGET = 40_000_000;

export function exportArea(bounds: Box | null, margin = EXPORT_MARGIN): Box | null {
  if (!bounds) return null;
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + 2 * margin,
    height: bounds.height + 2 * margin,
  };
}

export interface PdfPlan {
  readonly page: PageSize;
  readonly frame: PageFrame;
  readonly area: Box;
  /** Page pixels per canvas unit. */
  readonly scale: number;
  /** Horizontal offset that centres a narrow diagram in the content width. */
  readonly offsetX: number;
  /** In page pixels from the top of the area. */
  readonly slices: readonly Interval[];
}

export function planPdf(doc: DocumentState, paper: Paper, orientation: Orientation): PdfPlan | null {
  const area = exportArea(diagramBounds(doc));
  if (!area) return null;
  const page = pageSize(paper, orientation);
  const frame = pageFrame(page);
  const scale = Math.min(1, frame.contentWidth / area.width);
  const slices = paginate(documentUnits(doc, area.y, scale), frame.usableHeight, area.height * scale);
  return { page, frame, area, scale, offsetX: (frame.contentWidth - area.width * scale) / 2, slices };
}

/** True when an image of this CSS size at this pixel ratio fits the pixel budget. */
export const withinBudget = (width: number, height: number, pixelRatio: number): boolean =>
  width * height * pixelRatio * pixelRatio <= PIXEL_BUDGET;

/** A file name from the diagram title: lower case, words joined by hyphens, ASCII only. */
export function fileName(title: string, extension: "png" | "pdf"): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "diagram"}.${extension}`;
}

const STAMP_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/** The footer stamp of every page. */
export const generatedStamp = (date: Date): string =>
  `Generated on ${date.toLocaleString("en-GB", STAMP_FORMAT)}; may be out of date`;
