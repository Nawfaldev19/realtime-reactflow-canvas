import { describe, expect, it } from "vitest";
import { readEditableText } from "./editableText";

function editable(html: string): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

describe("readEditableText", () => {
  it("keeps newline characters typed into the text", () => {
    expect(readEditableText(editable("Cut\nSand"))).toBe("Cut\nSand");
  });

  it("turns <br> into line breaks, ignoring a trailing caret placeholder", () => {
    expect(readEditableText(editable("Cut<br>Sand"))).toBe("Cut\nSand");
    expect(readEditableText(editable("Cut<br>Sand<br>"))).toBe("Cut\nSand");
    expect(readEditableText(editable("Cut<br><br>"))).toBe("Cut\n");
  });

  it("starts a new line for each block element", () => {
    expect(readEditableText(editable("Cut<div>Sand</div><p>Oil</p>"))).toBe("Cut\nSand\nOil");
    expect(readEditableText(editable("<div>Cut</div><div><br></div>"))).toBe("Cut\n");
  });

  it("reads nested inline elements and skips comments", () => {
    expect(readEditableText(editable("<b>Cut</b> <i>twice</i><!-- note -->"))).toBe("Cut twice");
  });
});
