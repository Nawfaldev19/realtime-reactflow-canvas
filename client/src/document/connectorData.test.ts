import { describe, expect, it } from "vitest";
import { edge } from "../test/fixtures";
import {
  EDITABLE_LABEL_T,
  edgeLook,
  LABEL_T,
  labelFraction,
  labelLook,
  labelWeight,
  withLabelKeys,
  withStyleKeys,
} from "./connectorData";

describe("edgeLook", () => {
  it("defaults to a 2-wide solid line with a closed end arrow in the normal layer", () => {
    expect(edgeLook(edge("e", "a", "b"))).toEqual({
      color: null,
      width: 2,
      pattern: "solid",
      animated: false,
      startMarker: "none",
      endMarker: "closed",
      startMarkerColor: null,
      endMarkerColor: null,
      markerSize: 10,
      layer: "normal",
    });
  });

  it("reads valid values and ignores invalid ones", () => {
    const styled = edge("e", "a", "b", {
      style: {
        stroke: "#ff0000",
        width: 0,
        pattern: "dashed",
        animated: true,
        startMarker: "open",
        endMarker: "none",
        startMarkerColor: "#00ff00",
        endMarkerColor: "nope",
        markerSize: 30,
        layer: "front",
      },
    });
    expect(edgeLook(styled)).toMatchObject({
      color: "#ff0000",
      width: 0,
      pattern: "dashed",
      animated: true,
      startMarker: "open",
      endMarker: "none",
      startMarkerColor: "#00ff00",
      endMarkerColor: null,
      markerSize: 30,
      layer: "front",
    });
    expect(
      edgeLook(edge("e", "a", "b", { style: { width: 11, markerSize: 9, pattern: "wavy", layer: "top" } })),
    ).toMatchObject({ width: 2, markerSize: 10, pattern: "solid", layer: "normal" });
  });
});

describe("labelLook", () => {
  it("defaults to 12px, weight 700, max width 250 and padding 3 without a border", () => {
    const look = labelLook(null);
    expect(look).toEqual({
      fontSize: 12,
      bold: false,
      italic: false,
      underline: false,
      align: "center",
      color: null,
      background: null,
      maxWidth: 250,
      padding: 3,
      border: false,
      borderWidth: 1,
      borderColor: null,
    });
    expect(labelWeight(look)).toBe(700);
  });

  it("reads formatting within range", () => {
    const look = labelLook({
      text: "Yes",
      fontSize: 40,
      bold: true,
      italic: true,
      underline: true,
      align: "left",
      color: "#111",
      background: "#eee",
      maxWidth: 100,
      padding: 0,
      border: true,
      borderWidth: 5,
      borderColor: "#222",
    });
    expect(look).toMatchObject({
      fontSize: 40,
      bold: true,
      align: "left",
      maxWidth: 100,
      padding: 0,
      border: true,
      borderWidth: 5,
      borderColor: "#222",
    });
    expect(labelWeight(look)).toBe(900);
    expect(labelLook({ text: "", fontSize: 9, maxWidth: 501, padding: 21, borderWidth: 0 })).toMatchObject({
      fontSize: 12,
      maxWidth: 250,
      padding: 3,
      borderWidth: 1,
    });
  });
});

describe("labelFraction", () => {
  it("uses the stored position, clamped, or the default for the connector kind", () => {
    expect(labelFraction(edge("e", "a", "b", { label: { text: "x", t: 0.75 } }))).toBe(0.75);
    expect(labelFraction(edge("e", "a", "b", { label: { text: "x", t: 3 } }))).toBe(1);
    expect(labelFraction(edge("e", "a", "b", { label: { text: "x" } }))).toBe(EDITABLE_LABEL_T);
    expect(labelFraction(edge("e", "a", "b", { kind: "floating", label: null }))).toBe(LABEL_T);
  });
});

describe("merging", () => {
  it("merges style keys and removes nulls", () => {
    expect(withStyleKeys({ stroke: "#000", width: 3 }, { width: null, pattern: "dotted" })).toEqual({
      stroke: "#000",
      pattern: "dotted",
    });
  });

  it("merges label keys, creating a label and removing undefined keys", () => {
    expect(withLabelKeys(null, { bold: true })).toEqual({ text: "", bold: true });
    expect(withLabelKeys({ text: "Yes", t: 0.3 }, { t: undefined, text: "No" })).toEqual({ text: "No" });
  });
});
