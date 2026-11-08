import { describe, expect, it } from "vitest";
import { commandFor, isTextTarget, type KeyLike } from "./shortcuts";

const key = (overrides: Partial<KeyLike>): KeyLike => ({
  key: "",
  code: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: document.body,
  ...overrides,
});

describe("isTextTarget", () => {
  it("recognizes inputs, selects, text areas and editable elements", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "plaintext-only");
    for (const element of [
      document.createElement("input"),
      document.createElement("textarea"),
      document.createElement("select"),
      editable,
    ]) {
      expect(isTextTarget(element)).toBe(true);
    }
    expect(isTextTarget(document.createElement("div"))).toBe(false);
    expect(isTextTarget(null)).toBe(false);
  });
});

describe("commandFor", () => {
  const editing = { drawMode: false };

  it("maps the bracket keys to the stacking commands", () => {
    expect(commandFor(key({ code: "BracketRight", key: "]", metaKey: true }), editing)).toEqual({
      type: "arrange",
      command: "forward",
    });
    expect(commandFor(key({ code: "BracketRight", key: "}", ctrlKey: true, shiftKey: true }), editing)).toEqual({
      type: "arrange",
      command: "front",
    });
    expect(commandFor(key({ code: "BracketLeft", key: "[", ctrlKey: true }), editing)).toEqual({
      type: "arrange",
      command: "backward",
    });
    expect(commandFor(key({ code: "BracketLeft", key: "{", metaKey: true, shiftKey: true }), editing)).toEqual({
      type: "arrange",
      command: "back",
    });
    expect(commandFor(key({ code: "BracketLeft", key: "[" }), editing)).toBeNull();
  });

  it("maps Mod+G to group and Mod+Shift+G to ungroup", () => {
    expect(commandFor(key({ key: "g", metaKey: true }), editing)).toEqual({ type: "group" });
    expect(commandFor(key({ key: "G", ctrlKey: true, shiftKey: true }), editing)).toEqual({ type: "ungroup" });
  });

  it("Enter or F2 on a focused node edits it", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "react-flow__node";
    wrapper.dataset.id = "n1";
    const inner = document.createElement("span");
    wrapper.append(inner);
    expect(commandFor(key({ key: "Enter", target: inner }), editing)).toEqual({ type: "edit", nodeId: "n1" });
    expect(commandFor(key({ key: "F2", target: wrapper }), editing)).toEqual({ type: "edit", nodeId: "n1" });
    expect(commandFor(key({ key: "Enter" }), editing)).toBeNull();
    expect(commandFor(key({ key: "Enter", target: null }), editing)).toBeNull();
  });

  it("in draw mode, Escape stops drawing and Mod+Z removes the last stroke", () => {
    const drawing = { drawMode: true };
    expect(commandFor(key({ key: "Escape" }), drawing)).toEqual({ type: "stop-drawing" });
    expect(commandFor(key({ key: "z", metaKey: true }), drawing)).toEqual({ type: "remove-last-stroke" });
    expect(commandFor(key({ key: "z", metaKey: true, shiftKey: true }), drawing)).toBeNull();
    expect(commandFor(key({ key: "g", metaKey: true }), drawing)).toBeNull();
  });

  it("ignores everything typed into text fields and editors", () => {
    expect(commandFor(key({ key: "g", metaKey: true, target: document.createElement("input") }), editing)).toBeNull();
    expect(
      commandFor(key({ key: "Escape", target: document.createElement("textarea") }), { drawMode: true }),
    ).toBeNull();
  });

  it("maps undo, redo, duplicate and find on both platforms", () => {
    expect(commandFor(key({ key: "z", metaKey: true }), editing)).toEqual({ type: "undo" });
    expect(commandFor(key({ key: "Z", metaKey: true, shiftKey: true }), editing)).toEqual({ type: "redo" });
    expect(commandFor(key({ key: "z", ctrlKey: true, shiftKey: true }), editing)).toEqual({ type: "redo" });
    expect(commandFor(key({ key: "y", ctrlKey: true }), editing)).toEqual({ type: "redo" });
    expect(commandFor(key({ key: "y", metaKey: true }), editing)).toBeNull();
    expect(commandFor(key({ key: "d", metaKey: true }), editing)).toEqual({ type: "duplicate" });
    expect(commandFor(key({ key: "f", ctrlKey: true }), editing)).toEqual({ type: "find" });
    expect(commandFor(key({ key: "z" }), editing)).toBeNull();
  });

  it("leaves undo to the in-place text editor", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "plaintext-only");
    expect(commandFor(key({ key: "z", metaKey: true, target: editor }), editing)).toBeNull();
    expect(commandFor(key({ key: "y", ctrlKey: true, target: document.createElement("input") }), editing)).toBeNull();
  });
});
