import { layoutCompound, type CompoundResult, type LayoutTree } from "./compound";
import { layeredLayout } from "./layered";
import type { LayoutOptions } from "./types";

// The message a layered layout job sends to the worker and gets back. Kept
// apart from the runner so the worker bundle holds only the layered engine.

export interface LayoutRequestMessage {
  readonly id: number;
  readonly tree: LayoutTree;
  readonly options: LayoutOptions;
}

export interface LayoutResponseMessage {
  readonly id: number;
  readonly result: CompoundResult;
}

export const computeLayered = (message: LayoutRequestMessage): LayoutResponseMessage => ({
  id: message.id,
  result: layoutCompound(message.tree, layeredLayout, message.options),
});
