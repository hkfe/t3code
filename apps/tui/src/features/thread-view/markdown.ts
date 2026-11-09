import type { Nodes, PhrasingContent, RootContent, Table } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import stringWidth from "string-width";

import { theme } from "../../theme/theme.ts";
import { highlight } from "./highlight.ts";
import { span, truncate, wrap, wrapHard, type Line, type Span, type Style } from "./lines.ts";

export function parseMarkdown(text: string) {
  return fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

export type MarkdownTree = ReturnType<typeof parseMarkdown>;

function inline(nodes: ReadonlyArray<PhrasingContent>, style: Style): Span[] {
  return nodes.flatMap((node): Span[] => {
    switch (node.type) {
      case "text":
        return [span(node.value, style)];
      case "strong":
        return inline(node.children, { ...style, bold: true });
      case "emphasis":
        return inline(node.children, { ...style, italic: true });
      case "delete":
        return inline(node.children, { ...style, strikethrough: true });
      case "inlineCode":
        return [span(node.value, { ...style, color: theme.syntax.strings })];
      case "break":
        return [span("\n", style)];
      case "link": {
        const label = inline(node.children, { ...style, color: theme.info, underline: true });
        const text = label.map((part) => part.text).join("");
        return text === node.url || node.url.startsWith("mailto:")
          ? label
          : [...label, span(` (${node.url})`, { color: theme.textFaint })];
      }
      case "image":
        return [span(`[image: ${node.alt || node.url}]`, { ...style, color: theme.textMuted })];
      case "html":
        return [span(node.value, { ...style, color: theme.textMuted })];
      case "footnoteReference":
        return [span(`[^${node.identifier}]`, { ...style, color: theme.textMuted })];
      default:
        return "children" in node
          ? inline(node.children as PhrasingContent[], style)
          : "value" in node
            ? [span(String(node.value), style)]
            : [];
    }
  });
}

function plain(node: Nodes): string {
  if ("value" in node) return node.value;
  return "children" in node ? node.children.map((child) => plain(child as Nodes)).join("") : "";
}

function table(node: Table, width: number, base: Style): Line[] {
  const rows = node.children.map((row) =>
    row.children.map((cell) => plain(cell).replace(/\s+/g, " ").trim()),
  );
  const columns = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(1, ...rows.map((row) => stringWidth(row[column] ?? ""))),
  );
  const natural = widths.reduce((sum, w) => sum + w, 0) + (columns - 1) * 3;
  const border = { color: theme.border };
  const header = { ...base, bold: true };

  if (natural > width) {
    // Too wide for a grid: one block per row, `header: value` per cell.
    const [head = [], ...body] = rows;
    return body.flatMap((row, index) => [
      ...(index > 0 ? [[span("─".repeat(Math.min(width, 12)), border)]] : []),
      ...row.flatMap((cell, column) =>
        wrap([span(`${head[column] ?? ""}: `, header), span(cell, base)], width, [], [span("  ")]),
      ),
    ]);
  }
  const pad = (text: string, column: number) => {
    const w = widths[column]!;
    const gap = w - stringWidth(text);
    const align = node.align?.[column];
    if (align === "right") return " ".repeat(gap) + text;
    if (align === "center") return " ".repeat(gap >> 1) + text + " ".repeat(gap - (gap >> 1));
    return text + " ".repeat(gap);
  };
  const row = (cells: ReadonlyArray<string>, style: Style): Line =>
    widths.flatMap((_, column) => [
      ...(column > 0 ? [span(" │ ", border)] : []),
      span(truncate(pad(cells[column] ?? "", column), widths[column]!), style),
    ]);
  const [head = [], ...body] = rows;
  return [
    row(head, header),
    [span(widths.map((w) => "─".repeat(w)).join("─┼─"), border)],
    ...body.map((cells) => row(cells, base)),
  ];
}

function blocks(nodes: ReadonlyArray<RootContent>, width: number, base: Style): Line[] {
  const out: Line[] = [];
  for (const node of nodes) {
    if (out.length > 0 && node.type !== "listItem") out.push([]);
    out.push(...block(node, width, base));
  }
  return out;
}

function block(node: RootContent, available: number, base: Style): Line[] {
  // Each quote and list level takes columns; deep nesting must not reach zero.
  const width = Math.max(1, available);
  switch (node.type) {
    case "paragraph":
      return wrap(inline(node.children, base), width);
    case "heading": {
      const style = { ...base, bold: true, color: node.depth <= 2 ? theme.accent : theme.text };
      return wrap(inline(node.children, style), width, [
        span(`${"#".repeat(node.depth)} `, { color: theme.textFaint }),
      ]);
    }
    case "thematicBreak":
      return [[span("─".repeat(width), { color: theme.border })]];
    case "blockquote": {
      const bar = [span("│ ", { color: theme.border })];
      return blocks(node.children, width - 2, { ...base, color: theme.textMuted }).map((line) => [
        ...bar,
        ...line,
      ]);
    }
    case "list":
      return node.children.flatMap((item, index) => {
        const marker =
          item.checked === true
            ? "[x] "
            : item.checked === false
              ? "[ ] "
              : node.ordered
                ? `${(node.start ?? 1) + index}. `
                : "• ";
        const indent = " ".repeat(stringWidth(marker));
        const body = blocks(item.children, width - indent.length, base);
        if (!node.spread) {
          // Tight lists: drop the blank lines `blocks` puts between a paragraph and its sublist.
          for (let i = body.length - 1; i >= 0; i--) if (body[i]!.length === 0) body.splice(i, 1);
        }
        return body.map((line, lineIndex) => [
          span(lineIndex === 0 ? marker : indent, { color: theme.textMuted }),
          ...line,
        ]);
      });
    case "code": {
      const gutter = [span("▎ ", { color: theme.border })];
      const label = node.lang ? [[...gutter, span(node.lang, { color: theme.textFaint })]] : [];
      return [
        ...label,
        ...highlight(node.value, node.lang).flatMap((line) => wrapHard(line, width, gutter)),
      ];
    }
    case "table":
      return table(node, width, base);
    case "html":
      return wrap([span(node.value, { ...base, color: theme.textMuted })], width);
    case "definition":
      return [];
    default:
      return "children" in node
        ? blocks(node.children as RootContent[], width, base)
        : wrap([span(plain(node), base)], width);
  }
}

/** Renders parsed markdown to lines of at most `width` cells. */
export function renderMarkdown(tree: MarkdownTree, width: number, base: Style = {}): Line[] {
  return blocks(tree.children, Math.max(8, width), { color: theme.text, ...base });
}
