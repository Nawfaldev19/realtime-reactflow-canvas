import { isCentreAnchor, type ActiveGuides, type Guide, type Viewport } from "../geometry/guides";

// Draws the alignment guides into a 2D canvas context. Guides span the whole
// visible canvas; edge guides are solid and centre guides dashed (5 on, 5
// off), both 2 px wide. The backing store is size × devicePixelRatio and the
// context is scaled by the same ratio, so lines stay crisp on dense screens
// while all the maths below is in CSS pixels.

export const GUIDE_WIDTH = 2;
export const GUIDE_DASH: readonly number[] = [5, 5];

export type GuideContext = Pick<
  CanvasRenderingContext2D,
  "setTransform" | "clearRect" | "beginPath" | "moveTo" | "lineTo" | "stroke" | "setLineDash"
> & {
  strokeStyle: CanvasRenderingContext2D["strokeStyle"];
  lineWidth: number;
};

export interface Surface {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

/** Backing-store size for a surface: the CSS size times the device pixel ratio, rounded. */
export const backingSize = ({ width, height, pixelRatio }: Surface) => ({
  width: Math.round(width * pixelRatio),
  height: Math.round(height * pixelRatio),
});

/** Screen position of a guide: x = value × zoom + tx for vertical guides, y = value × zoom + ty for horizontal ones. */
export const guideScreenPosition = (guide: Guide, viewport: Viewport): number =>
  guide.value * viewport.zoom + (guide.orientation === "vertical" ? viewport.x : viewport.y);

export function drawGuides(
  context: GuideContext,
  guides: ActiveGuides,
  viewport: Viewport,
  surface: Surface,
  accent: string,
): void {
  context.setTransform(surface.pixelRatio, 0, 0, surface.pixelRatio, 0, 0);
  context.clearRect(0, 0, surface.width, surface.height);
  context.lineWidth = GUIDE_WIDTH;
  for (const guide of [guides.horizontal, guides.vertical]) {
    if (!guide) continue;
    // Rounded to whole pixels so the 2 px lines stay sharp.
    const at = Math.round(guideScreenPosition(guide, viewport));
    context.strokeStyle = guide.color ?? accent;
    context.setLineDash(isCentreAnchor(guide.anchor) ? [...GUIDE_DASH] : []);
    context.beginPath();
    if (guide.orientation === "vertical") {
      context.moveTo(at, 0);
      context.lineTo(at, surface.height);
    } else {
      context.moveTo(0, at);
      context.lineTo(surface.width, at);
    }
    context.stroke();
  }
}
