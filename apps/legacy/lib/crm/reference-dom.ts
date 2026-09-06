import {
  referenceToken,
  segmentRichText,
  type Reference,
} from "@/lib/crm/rich-text";

/**
 * The bridge between the stored body and what somebody types into.
 *
 * The body is stored as text with `@[Name](kind:uuid)` tokens, which is the
 * right thing to store — greppable, exportable, readable in an email. It is the
 * wrong thing to *show* somebody while they write, and a textarea has no way to
 * show anything else, so a mention appeared as a name followed by a uuid in
 * brackets in every note and description in the product.
 *
 * So the editor is a `contenteditable` and these functions move between the two
 * representations: `renderBody` turns tokens into chips, `serialise` turns
 * chips back into tokens. Nothing else in the CRM has to know, because what
 * leaves here is the same string that always left.
 *
 * The offset functions exist because every caret-aware operation — the `@`
 * picker, the formatting buttons — is written against the string, and a DOM
 * selection has to be converted into a position in it and back.
 */

/** Tags that end a line when a browser produces them mid-edit. */
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "BLOCKQUOTE"]);

/** The token a chip stands for, kept on the element so serialising is exact. */
const TOKEN_ATTRIBUTE = "data-reference";

export function serialise(root: HTMLElement): string {
  let out = "";

  const walk = (node: Node, isFirstChildOfRoot: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    const token = node.getAttribute(TOKEN_ATTRIBUTE);
    if (token) {
      out += token;
      return;
    }
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }

    // A browser wraps new lines in divs as often as it inserts a `<br>`. Both
    // mean the same thing here, but the first div of a fresh edit is the line
    // already being written rather than a new one.
    if (BLOCK_TAGS.has(node.tagName) && !isFirstChildOfRoot && !out.endsWith("\n")) {
      out += "\n";
    }
    node.childNodes.forEach((child) => walk(child, false));
  };

  root.childNodes.forEach((child, index) => walk(child, index === 0));
  return out;
}

/**
 * Where the caret is, as a position in the serialised body.
 *
 * Returns null when the selection is not inside this editor — which happens
 * constantly, because the picker's own buttons take focus.
 */
export function offsetOf(root: HTMLElement, node: Node, offset: number): number | null {
  if (!root.contains(node)) return null;

  let total = 0;
  let found = false;

  const walk = (current: Node, isFirstChildOfRoot: boolean) => {
    if (found) return;

    if (current === node && current.nodeType !== Node.TEXT_NODE) {
      // A selection anchored on an element counts the children before it.
      let index = 0;
      for (const child of Array.from(current.childNodes)) {
        if (index >= offset) break;
        walk(child, false);
        index += 1;
      }
      found = true;
      return;
    }

    if (current.nodeType === Node.TEXT_NODE) {
      if (current === node) {
        total += offset;
        found = true;
        return;
      }
      total += (current.nodeValue ?? "").length;
      return;
    }

    if (!(current instanceof HTMLElement)) return;

    const token = current.getAttribute(TOKEN_ATTRIBUTE);
    if (token) {
      total += token.length;
      return;
    }
    if (current.tagName === "BR") {
      total += 1;
      return;
    }
    if (BLOCK_TAGS.has(current.tagName) && !isFirstChildOfRoot) {
      total += 1;
    }
    current.childNodes.forEach((child) => walk(child, false));
  };

  root.childNodes.forEach((child, index) => walk(child, index === 0));
  return found ? total : null;
}

/** Put the caret at a position in the serialised body. */
export function placeCaret(root: HTMLElement, target: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  let seen = 0;
  let placed = false;

  const walk = (node: Node, isFirstChildOfRoot: boolean) => {
    if (placed) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node.nodeValue ?? "").length;
      if (seen + length >= target) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, target - seen));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        placed = true;
        return;
      }
      seen += length;
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    const token = node.getAttribute(TOKEN_ATTRIBUTE);
    if (token) {
      seen += token.length;
      if (seen >= target) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        placed = true;
      }
      return;
    }
    if (node.tagName === "BR") {
      seen += 1;
      return;
    }
    if (BLOCK_TAGS.has(node.tagName) && !isFirstChildOfRoot) {
      seen += 1;
    }
    node.childNodes.forEach((child) => walk(child, false));
  };

  root.childNodes.forEach((child, index) => walk(child, index === 0));

  if (!placed) {
    // Past the end, or an empty editor: sit at the very end of it.
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Draw the body into the editor.
 *
 * Chips are `contenteditable="false"` so a backspace removes the whole
 * reference rather than eating one character of somebody's name and leaving a
 * token that no longer parses.
 */
export function renderBody(
  root: HTMLElement,
  body: string,
  chip: (reference: Reference) => HTMLElement,
): void {
  root.replaceChildren();

  for (const segment of segmentRichText(body)) {
    if (segment.kind === "reference") {
      root.appendChild(chip(segment.reference));
      continue;
    }

    const lines = segment.text.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) root.appendChild(document.createElement("br"));
      if (line) root.appendChild(document.createTextNode(line));
    });
  }

  // An editor with no text node has nowhere to put a caret in some browsers.
  if (!root.firstChild) root.appendChild(document.createTextNode(""));
}

/** The token a chip element carries, for whoever builds one. */
export function chipToken(reference: Reference): string {
  return referenceToken(reference);
}

export { TOKEN_ATTRIBUTE };
