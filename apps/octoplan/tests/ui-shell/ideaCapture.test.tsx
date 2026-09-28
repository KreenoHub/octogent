// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTags } from "../../web/src/app/planActions";
import { TOAST_MS } from "../../web/src/components/Toasts";
import { idea, session } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const ALPHA = "C:\\repos\\alpha";

const withSession = () => {
  const view = renderCockpit();
  view.emit({ type: "sessions", sessions: [session()] });
  return view;
};

const ideaDialog = () => screen.queryByRole("dialog", { name: "Capture idea" });

afterEach(() => {
  vi.useRealTimers();
});

describe("idea capture (I)", () => {
  it("parses comma-separated tags", () => {
    expect(parseTags(" ux, later ,, ux ,")).toEqual(["ux", "later"]);
    expect(parseTags("   ")).toEqual([]);
  });

  it("I opens the modal; Enter sends capture-idea for the active repo and closes it", () => {
    const { transport } = withSession();
    fireEvent.keyDown(window, { key: "i" });
    const dialog = ideaDialog();
    if (!dialog) throw new Error("idea dialog did not open");
    const title = within(dialog).getByLabelText("Idea");
    expect(title).toHaveFocus();
    fireEvent.change(title, { target: { value: "  Offline mode  " } });
    fireEvent.change(within(dialog).getByLabelText("Tags (comma-separated)"), {
      target: { value: "sync, later" },
    });
    fireEvent.submit(title.closest("form") as HTMLFormElement);
    expect(transport.sent).toEqual([
      { type: "capture-idea", repoPath: ALPHA, title: "Offline mode", tags: ["sync", "later"] },
    ]);
    expect(ideaDialog()).not.toBeInTheDocument();
  });

  it("omits tags when none are given", () => {
    const { transport } = withSession();
    fireEvent.keyDown(window, { key: "I" });
    fireEvent.change(screen.getByLabelText("Idea"), { target: { value: "Dark mode" } });
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));
    expect(transport.sent).toEqual([{ type: "capture-idea", repoPath: ALPHA, title: "Dark mode" }]);
  });

  it("does not open while typing, closes on Escape and refuses an empty title", () => {
    const { transport } = withSession();
    const composer = screen.getByRole("textbox", { name: "Message Claude" });
    fireEvent.keyDown(composer, { key: "i" });
    expect(ideaDialog()).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "i" });
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the idea a title");
    expect(transport.sent).toEqual([]);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(ideaDialog()).not.toBeInTheDocument();
  });

  it("shows the server notice as a toast that expires", () => {
    vi.useFakeTimers();
    const { emit } = withSession();
    emit({ type: "notice", message: "Captured I4" });
    expect(screen.getByTestId("toast")).toHaveTextContent("Captured I4");
    act(() => vi.advanceTimersByTime(TOAST_MS + 10));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("toasts can be dismissed early", () => {
    const { emit } = withSession();
    emit({ type: "notice", message: "One" }, { type: "notice", message: "Two" });
    expect(screen.getAllByTestId("toast")).toHaveLength(2);
    fireEvent.click(
      within(screen.getAllByTestId("toast")[0] as HTMLElement).getByLabelText("Dismiss"),
    );
    expect(screen.getAllByTestId("toast").map((t) => t.textContent)).toEqual(["Two×"]);
  });
});

describe("idea search", () => {
  it("sends search-ideas and lists results with their repo", () => {
    const { transport, emit } = withSession();
    const ideas = screen.getByRole("region", { name: "Ideas" });
    fireEvent.change(within(ideas).getByLabelText("Search ideas"), {
      target: { value: " offline " },
    });
    fireEvent.click(within(ideas).getByRole("button", { name: "Search" }));
    expect(transport.sent).toEqual([{ type: "search-ideas", query: "offline" }]);
    expect(within(ideas).getByText("Searching…")).toBeInTheDocument();

    emit({
      type: "ideas",
      query: "offline",
      results: [
        { repoPath: ALPHA, idea: idea() },
        { repoPath: "C:\\repos\\beta", idea: idea({ id: "I7", title: "Offline sync" }) },
      ],
    });
    const list = within(ideas).getByRole("list", { name: "Idea results" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("I7");
    expect(rows[1]).toHaveTextContent("Offline sync");
    expect(rows[1]).toHaveTextContent("beta");
  });
});
