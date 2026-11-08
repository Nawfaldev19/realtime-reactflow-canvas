import { useEffect, useRef, type RefObject } from "react";
import { CLIPBOARD_TYPE, parseClipboard, serializeClipboard } from "../document/clipboard";
import type { Point } from "../document/types";
import { isTextTarget } from "./shortcuts";
import type { EditorStoreApi } from "./store";

// Copy and paste through the browser's own clipboard events, so a copy can be
// pasted in another tab or window. The copy goes out twice: under our own type
// and as plain text (some browsers only keep text between windows). Copying
// and pasting inside a text field or the in-place editor are left to the
// browser. A paste lands with the copy's top-left at the pointer when the
// pointer is over the canvas, otherwise at the centre of the view; a
// clipboard holding anything else is ignored.

export function useClipboard(
  api: EditorStoreApi,
  canvas: RefObject<HTMLElement>,
  toFlow: (client: Point) => Point,
): void {
  const pointer = useRef<Point | null>(null);
  const convert = useRef(toFlow);
  convert.current = toFlow;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    const onLeave = () => {
      pointer.current = null;
    };
    const textSelected = () => {
      const selection = window.getSelection();
      return selection !== null && !selection.isCollapsed;
    };
    const onCopy = (event: ClipboardEvent) => {
      if (isTextTarget(event.target) || textSelected()) return;
      const payload = api.getState().copySelection();
      if (!payload) return;
      const text = serializeClipboard(payload);
      event.clipboardData?.setData(CLIPBOARD_TYPE, text);
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isTextTarget(event.target) || !api.getState().canEdit) return;
      const data = event.clipboardData;
      const text = data ? data.getData(CLIPBOARD_TYPE) || data.getData("text/plain") : "";
      const payload = text ? parseClipboard(text) : api.getState().clipboard;
      if (!payload) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const at = pointer.current ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const origin = convert.current(at);
      api.getState().paste(payload, { x: Math.round(origin.x), y: Math.round(origin.y) });
    };
    element.addEventListener("pointermove", onMove, { passive: true });
    element.addEventListener("pointerleave", onLeave, { passive: true });
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [api, canvas]);
}
