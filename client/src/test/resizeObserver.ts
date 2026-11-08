import { vi } from "vitest";

/**
 * jsdom has no layout engine, so ResizeObserver never fires on its own.
 * Tests call `resizeTo(element, height)` to deliver a measurement to every
 * observer watching that element.
 */
export class ResizeObserverStub {
  static readonly instances = new Set<ResizeObserverStub>();
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.add(this);
  }

  observe = vi.fn((target: Element) => {
    this.targets.add(target);
  });

  unobserve = vi.fn((target: Element) => {
    this.targets.delete(target);
  });

  disconnect = vi.fn(() => {
    this.targets.clear();
    ResizeObserverStub.instances.delete(this);
  });

  deliver(target: Element, width: number, height: number): void {
    if (!this.targets.has(target)) return;
    const entry = {
      target,
      contentRect: { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this);
  }
}

export function resizeTo(element: Element, height: number, width = 100): void {
  for (const observer of ResizeObserverStub.instances) observer.deliver(element, width, height);
}

/** jsdom has no PointerEvent; this one carries the pointer fields the editor reads. */
export class PointerEventStub extends MouseEvent {
  readonly pointerId: number;
  readonly pressure: number;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pressure = init.pressure ?? 0;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
