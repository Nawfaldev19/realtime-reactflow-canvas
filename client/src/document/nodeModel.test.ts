import { describe, expect, it } from "vitest";
import { node } from "../test/fixtures";
import { groupBackground, isColor } from "./colors";
import { cornerRadius, KIND_TRAITS } from "./nodeKinds";
import { boxStyle, dashArray, lineProps, nodeText, shapeOf, sketchProps, textFormat } from "./nodeData";
import { NODE_KINDS } from "./types";

describe("colours", () => {
  it.each(["#abc", "#abcd", "#a1b2c3", "#a1b2c3d4", "rgb(1, 2, 3)", "rgba(255,255,255,0.5)", "RGBA(0, 0, 0, 1)"])(
    "accepts %s",
    (value) => {
      expect(isColor(value)).toBe(true);
    },
  );

  it.each(["red", "#12", "#ggg", "rgb(300, 0, 0)", "rgba(1, 2, 3)", "rgb(1, 2, 3, 0.5)", "rgba(1, 2, 3, 2)", 12, null])(
    "rejects %s",
    (value) => {
      expect(isColor(value)).toBe(false);
    },
  );

  it("turns hex or rgb plus an opacity into rgba, clamping the opacity", () => {
    expect(groupBackground("#808080", 0.5)).toBe("rgba(128, 128, 128, 0.5)");
    expect(groupBackground("#fff", 3)).toBe("rgba(255, 255, 255, 1)");
    expect(groupBackground("rgb(10, 20, 30)", -1)).toBe("rgba(10, 20, 30, 0)");
    expect(groupBackground("#000000", undefined)).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("keeps colours that already carry alpha, and rejects the rest", () => {
    expect(groupBackground("rgba(1, 2, 3, 0.2)", 0.9)).toBe("rgba(1, 2, 3, 0.2)");
    expect(groupBackground("#11223344", 0.9)).toBe("#11223344");
    expect(groupBackground("blue", 0.5)).toBeNull();
    expect(groupBackground(7, 0.5)).toBeNull();
  });
});

describe("kind traits", () => {
  it("has a row for every kind", () => {
    expect(Object.keys(KIND_TRAITS).sort()).toEqual([...NODE_KINDS].sort());
  });

  it("sticky notes, labels, lines and sketches take no edges", () => {
    expect(NODE_KINDS.filter((kind) => !KIND_TRAITS[kind].connectable)).toEqual(["note", "label", "line", "sketch"]);
  });

  it("a start/end node 120px tall has radius 60; steps 8, stickies 4", () => {
    expect(cornerRadius("start-end", 120)).toBe(60);
    expect(cornerRadius("step", 120)).toBe(8);
    expect(cornerRadius("group", 50)).toBe(8);
    expect(cornerRadius("note", 50)).toBe(4);
    expect(cornerRadius("label", 50)).toBe(4);
    expect(cornerRadius("shape", 50)).toBe(0);
  });
});

describe("node data readers", () => {
  it("reads text, defaulting to empty", () => {
    expect(nodeText(node("a", { data: { text: "Sand" } }))).toBe("Sand");
    expect(nodeText(node("a", { data: { text: 4 } }))).toBe("");
  });

  it("reads text formatting with per-kind defaults", () => {
    expect(textFormat(node("a"))).toEqual({ bold: false, italic: false, align: "center", fontSize: 14, color: null });
    expect(textFormat(node("a", { kind: "note" })).align).toBe("left");
    expect(textFormat(node("a", { kind: "start-end" })).bold).toBe(true);
    expect(textFormat(node("a", { kind: "start-end", style: { fontWeight: "normal" } })).bold).toBe(false);
    expect(
      textFormat(
        node("a", {
          style: { fontWeight: "bold", fontStyle: "italic", textAlign: "right", fontSize: 20, color: "#123456" },
        }),
      ),
    ).toEqual({
      bold: true,
      italic: true,
      align: "right",
      fontSize: 20,
      color: "#123456",
    });
    expect(textFormat(node("a", { style: { textAlign: "justify", fontSize: 500 } }))).toMatchObject({
      align: "center",
      fontSize: 14,
    });
  });

  it("reads box style, ignoring invalid values", () => {
    expect(boxStyle(node("a"))).toEqual({
      fill: null,
      stroke: null,
      borderWidth: null,
      borderStyle: null,
      opacity: 0.5,
      keepAspectRatio: false,
    });
    expect(
      boxStyle(
        node("a", {
          style: {
            fill: "#fff",
            stroke: "nope",
            borderWidth: 2,
            borderStyle: "dashed",
            opacity: 0.2,
            keepAspectRatio: true,
          },
        }),
      ),
    ).toEqual({
      fill: "#fff",
      stroke: null,
      borderWidth: 2,
      borderStyle: "dashed",
      opacity: 0.2,
      keepAspectRatio: true,
    });
    expect(boxStyle(node("a", { style: { borderWidth: 99, borderStyle: "wavy", opacity: 2 } }))).toMatchObject({
      borderWidth: null,
      borderStyle: null,
      opacity: 0.5,
    });
  });

  it("reads line properties, deriving a missing length from the box", () => {
    const stored = node("l", {
      kind: "line",
      size: { width: 160, height: 20 },
      data: { rotation: 450, length: 120, thickness: 6, color: "#ff0000", lineStyle: "dotted" },
    });
    expect(lineProps(stored)).toEqual({
      rotation: 90,
      length: 120,
      thickness: 6,
      color: "#ff0000",
      lineStyle: "dotted",
    });
    const legacy = node("l", { kind: "line", size: { width: 200, height: 20 }, data: { thickness: 50 } });
    expect(lineProps(legacy)).toEqual({ rotation: 90, length: 200, thickness: 4, color: null, lineStyle: "solid" });
    expect(lineProps(node("l", { kind: "line", size: { width: 20, height: 20 }, data: { length: 5 } })).length).toBe(
      30,
    );
    expect(lineProps(node("l", { kind: "line", size: { width: 20, height: 20 }, data: {} })).length).toBe(30);
  });

  it("builds dash patterns: dashed 10,5 and dotted thickness,2×thickness", () => {
    expect(dashArray("solid", 4)).toBeUndefined();
    expect(dashArray("dashed", 4)).toBe("10,5");
    expect(dashArray("dotted", 4)).toBe("4,8");
  });

  it("reads sketch samples and their initial size, falling back to the box", () => {
    const sketch = node("s", {
      kind: "sketch",
      size: { width: 50, height: 40 },
      data: { points: [1, 2, 0.5, 3, 4, 1, "x"], initialSize: { width: 25, height: 20 }, strokeSize: 9, color: "#000" },
    });
    expect(sketchProps(sketch)).toEqual({
      points: [
        { x: 1, y: 2, pressure: 0.5 },
        { x: 3, y: 4, pressure: 1 },
      ],
      initialSize: { width: 25, height: 20 },
      color: "#000",
      strokeSize: 9,
    });
    expect(sketchProps(node("s", { kind: "sketch", data: { initialSize: { width: 0, height: 3 } } }))).toEqual({
      points: [],
      initialSize: { width: 100, height: 50 },
      color: null,
      strokeSize: 7,
    });
  });

  it("decisions are diamonds and shapes name their outline", () => {
    expect(shapeOf(node("d", { kind: "decision" }))).toBe("diamond");
    expect(shapeOf(node("s", { kind: "shape", data: { shape: "cylinder" } }))).toBe("cylinder");
    expect(shapeOf(node("s", { kind: "shape", data: { shape: "blob" } }))).toBe("hexagon");
    expect(shapeOf(node("s"))).toBeNull();
  });
});
