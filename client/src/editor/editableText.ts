// Reads plain text (with line breaks) back out of a contenteditable element.
// Browsers represent a typed line break as a newline character, a <br>, or a
// new <div>/<p> block depending on the engine and the editing mode, so all
// three are understood. A <br> that is the last child of its parent is the
// caret placeholder engines add to an empty last line, so it adds no line.

const BLOCKS = new Set(["DIV", "P"]);

function collect(node: Node, parts: string[]): void {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent ?? "");
      return;
    }
    if (!(child instanceof HTMLElement)) return;
    if (child.tagName === "BR") {
      if (child !== node.lastChild) parts.push("\n");
      return;
    }
    const block = BLOCKS.has(child.tagName);
    const before = parts.join("");
    if (block && before.length > 0 && !before.endsWith("\n")) parts.push("\n");
    collect(child, parts);
  });
}

export function readEditableText(element: HTMLElement): string {
  const parts: string[] = [];
  collect(element, parts);
  return parts.join("");
}
