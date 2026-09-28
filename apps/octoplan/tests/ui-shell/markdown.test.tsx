// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown, parseMarkdownBlocks } from "../../web/src/app/markdown";

describe("markdown rendering in reply cards", () => {
  it("parses paragraphs, headings, lists and fenced code", () => {
    expect(
      parseMarkdownBlocks(
        "Intro line\nstill intro\n\n### Sub\n- one\n- two\n  continued\n1. first\n2. second\n```ts\nconst x = 1;\n# not a heading\n```",
      ),
    ).toEqual([
      { kind: "paragraph", text: "Intro line still intro" },
      { kind: "heading", text: "Sub" },
      { kind: "list", ordered: false, items: ["one", "two continued"] },
      { kind: "list", ordered: true, items: ["first", "second"] },
      { kind: "code", text: "const x = 1;\n# not a heading" },
    ]);
  });

  it("renders inline code, bold and link labels", () => {
    const { container } = render(
      <Markdown text="Use `pnpm test` and **D4** per [the spec](https://example.com)." />,
    );
    expect(container.querySelector("code")?.textContent).toBe("pnpm test");
    expect(container.querySelector("strong")?.textContent).toBe("D4");
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("Use pnpm test and D4 per the spec.");
  });

  it("never turns HTML in Claude's text into elements", () => {
    const { container } = render(
      <Markdown text={'<script>alert(1)</script> <img src=x onerror="alert(2)">'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});
