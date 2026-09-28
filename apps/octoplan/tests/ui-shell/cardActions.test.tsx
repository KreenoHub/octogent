// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cardActionMessage, followUpQuote, quoteSection } from "../../web/src/app/cardActions";
import { sectionBlock, session } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const SECTION = { heading: "Storage", markdown: "Use SQLite.\n\nIt is local." };

const withSections = () => {
  const view = renderCockpit();
  view.emit(
    { type: "sessions", sessions: [session()] },
    { type: "block", sessionId: "s1", block: sectionBlock("b1", "Storage", 3) },
    { type: "block", sessionId: "s1", block: sectionBlock("b2", "Risks", 2) },
  );
  const card = (name: string) => screen.getByRole("article", { name });
  const toolbar = (name: string) => within(card(name)).getByRole("toolbar");
  return { ...view, card, toolbar };
};

describe("card action text", () => {
  it("quotes every line of a section under its heading", () => {
    expect(quoteSection(SECTION)).toBe("> **Storage**\n> Use SQLite.\n>\n> It is local.");
  });

  it("builds a clear instruction per action", () => {
    expect(cardActionMessage("task", SECTION)).toMatch(/^Turn this section into a todo item/);
    expect(cardActionMessage("decision", SECTION)).toContain("plan_record_decision");
    expect(cardActionMessage("park", SECTION)).toContain("plan_park");
    expect(cardActionMessage("park", SECTION)).toContain("assumption");
    expect(cardActionMessage("task", SECTION).endsWith(quoteSection(SECTION))).toBe(true);
  });

  it("keeps the follow-up quote short", () => {
    const long = { heading: "H", markdown: "a\nb\nc\nd\ne" };
    expect(followUpQuote(long)).toBe("> **H**\n> a\n> b\n> c\n> …\n\n");
  });
});

describe("reply-card toolbar", () => {
  it("→ task, → decision and park each send one send-message with the quoted section", () => {
    const { toolbar, transport } = withSections();
    const block = { heading: "Storage", markdown: sectionBlockMarkdown("Storage", 3) };
    fireEvent.click(within(toolbar("Storage")).getByRole("button", { name: "→ Task" }));
    fireEvent.click(within(toolbar("Storage")).getByRole("button", { name: "→ Decision" }));
    fireEvent.click(within(toolbar("Storage")).getByRole("button", { name: "Park" }));
    expect(transport.sent).toEqual([
      { type: "send-message", sessionId: "s1", text: cardActionMessage("task", block) },
      { type: "send-message", sessionId: "s1", text: cardActionMessage("decision", block) },
      { type: "send-message", sessionId: "s1", text: cardActionMessage("park", block) },
    ]);
  });

  it("pin adds the card to the pinned strip; unpin (either place) removes it", () => {
    const { toolbar } = withSections();
    expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument();

    fireEvent.click(within(toolbar("Storage")).getByRole("button", { name: "Pin" }));
    const strip = screen.getByRole("region", { name: "Pinned" });
    expect(within(strip).getByRole("button", { name: "Storage" })).toBeInTheDocument();
    expect(within(toolbar("Storage")).getByRole("button", { name: "Unpin" })).toBeInTheDocument();

    fireEvent.click(within(strip).getByRole("button", { name: "Unpin Storage" }));
    expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument();

    fireEvent.click(within(toolbar("Risks")).getByRole("button", { name: "Pin" }));
    fireEvent.click(within(toolbar("Risks")).getByRole("button", { name: "Unpin" }));
    expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument();
  });

  it("the toolbar's expand/collapse toggles the one-line digest (D15)", () => {
    const { card, toolbar } = withSections();
    expect(card("Storage")).toHaveAttribute("data-collapsed", "true");
    expect(within(card("Storage")).queryByText(/line 3 of Storage/)).not.toBeInTheDocument();
    fireEvent.click(within(toolbar("Storage")).getByRole("button", { name: "Expand card" }));
    expect(card("Storage")).toHaveAttribute("data-collapsed", "false");
    expect(within(card("Storage")).getByText(/line 3 of Storage/)).toBeInTheDocument();
    fireEvent.click(within(toolbar("Storage")).getByRole("button", { name: "Collapse card" }));
    expect(within(card("Storage")).queryByText(/line 3 of Storage/)).not.toBeInTheDocument();
  });

  it("ask follow-up prefills and focuses the composer with a quote, sending nothing", () => {
    const { toolbar, transport } = withSections();
    fireEvent.click(within(toolbar("Risks")).getByRole("button", { name: "Ask follow-up" }));
    const composer = screen.getByRole("textbox", { name: "Message Claude" });
    expect(composer).toHaveValue("> **Risks**\n> line 1 of Risks\n> line 2 of Risks\n\n");
    expect(composer).toHaveFocus();
    expect(transport.sent).toEqual([]);
  });
});

const sectionBlockMarkdown = (heading: string, lines: number) => {
  const block = sectionBlock("x", heading, lines);
  return block.kind === "section" ? block.markdown : "";
};
