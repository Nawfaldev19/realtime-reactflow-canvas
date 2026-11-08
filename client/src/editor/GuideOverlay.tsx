import { useEffect, useRef, useState } from "react";
import { useStore } from "@xyflow/react";
import { useEditor } from "./EditorStoreContext";
import { backingSize, drawGuides, type GuideContext, type Surface } from "./guideDrawing";

// One canvas above the steps, mounted once per editor and redrawn when the
// guides or the viewport change. It never takes the pointer. Only this leaf
// component subscribes to the guides, so a drag frame re-renders nothing else.

export function GuideOverlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const guides = useEditor((state) => state.guides);
  const [tx, ty, zoom] = useStore((state) => state.transform);
  const [surface, setSurface] = useState<Surface>({ width: 0, height: 0, pixelRatio: 1 });
  const { pixelRatio } = surface;

  useEffect(() => {
    const element = canvas.current?.parentElement;
    if (!element) return;
    const measure = () =>
      setSurface({
        width: element.clientWidth,
        height: element.clientHeight,
        pixelRatio: window.devicePixelRatio || 1,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // A change of screen (or browser zoom) changes the pixel ratio without resizing the element.
    const ratio =
      typeof window.matchMedia === "function" ? window.matchMedia(`(resolution: ${String(pixelRatio)}dppx)`) : null;
    ratio?.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      ratio?.removeEventListener("change", measure);
    };
  }, [pixelRatio]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d") as GuideContext | null | undefined;
    if (!element || !context) return;
    const accent = getComputedStyle(element).getPropertyValue("--color-accent").trim() || "#b4532a";
    drawGuides(context, guides, { x: tx, y: ty, zoom }, surface, accent);
  }, [guides, tx, ty, zoom, surface]);

  const backing = backingSize(surface);
  const vertical = guides.vertical;
  const horizontal = guides.horizontal;
  return (
    <canvas
      ref={canvas}
      className="guide-overlay"
      aria-hidden="true"
      data-testid="guide-overlay"
      data-vertical={vertical ? `${vertical.anchor}:${String(Math.round(vertical.value * 100) / 100)}` : undefined}
      data-horizontal={
        horizontal ? `${horizontal.anchor}:${String(Math.round(horizontal.value * 100) / 100)}` : undefined
      }
      width={backing.width}
      height={backing.height}
      style={{ width: surface.width, height: surface.height }}
    />
  );
}
