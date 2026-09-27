import { Fragment, type ReactNode } from "react";

// A deliberately small markdown renderer that builds React elements only.
// Claude's text never reaches innerHTML, so HTML in a reply renders as literal text,
// and links show their label without a clickable target (no javascript: URLs).

type Block =
  | { kind: "code"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string };

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^#{1,6}\s+(.*)$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;

export const parseMarkdownBlocks = (source: string): Block[] => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      index++;
      while (
        index < lines.length &&
        !(lines[index] ?? "").trimStart().startsWith(fence[1] ?? "```")
      ) {
        code.push(lines[index] ?? "");
        index++;
      }
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", text: heading[1] ?? "" });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    const ordered = bullet ? null : ORDERED_RE.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const text = (bullet?.[1] ?? ordered?.[1] ?? "").trim();
      const last = blocks.at(-1);
      if (last?.kind === "list" && last.ordered === isOrdered) last.items.push(text);
      else blocks.push({ kind: "list", ordered: isOrdered, items: [text] });
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    // A plain line right after a list item continues that item.
    const last = blocks.at(-1);
    if (paragraph.length === 0 && last?.kind === "list" && /^\s{2,}\S/.test(line)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
};

const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

export const renderInline = (text: string): ReactNode[] =>
  text.split(INLINE_RE).map((part, index) => {
    const key = `${index}-${part.length}`;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    const link = /^\[([^\]]+)\]\([^)]+\)$/.exec(part);
    if (link) return <span key={key}>{link[1]}</span>;
    return <Fragment key={key}>{part}</Fragment>;
  });

export const Markdown = ({ text }: { text: string }) => (
  <div className="op-md">
    {parseMarkdownBlocks(text).map((block, index) => {
      const key = `${block.kind}-${index}`;
      switch (block.kind) {
        case "code":
          return (
            <pre key={key} className="op-md-code">
              <code>{block.text}</code>
            </pre>
          );
        case "heading":
          return (
            <h4 key={key} className="op-md-heading">
              {renderInline(block.text)}
            </h4>
          );
        case "list": {
          const items = block.items.map((item, itemIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from immutable text on every render; items never reorder
            <li key={`${key}-${itemIndex}`}>{renderInline(item)}</li>
          ));
          return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        default:
          return <p key={key}>{renderInline(block.text)}</p>;
      }
    })}
  </div>
);
