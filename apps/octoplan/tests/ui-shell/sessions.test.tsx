// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { groupSessionsByRepo, normalizeRepoPath } from "../../web/src/app/sessionView";
import { session } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

describe("new session dialog", () => {
  it("sends the exact start-session event from the filled form", () => {
    const { transport } = renderCockpit();
    fireEvent.click(screen.getByRole("button", { name: "+ NEW SESSION" }));
    const dialog = screen.getByRole("dialog", { name: "New session" });
    fireEvent.change(within(dialog).getByLabelText("Repo folder"), {
      target: { value: '  "C:\\Users\\me\\Projects\\alpha"  ' },
    });
    fireEvent.change(within(dialog).getByLabelText("Mode"), {
      target: { value: "devils-advocate" },
    });
    fireEvent.change(within(dialog).getByLabelText("Topic"), {
      target: { value: "Pricing page" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(transport.sent).toEqual([
      {
        type: "start-session",
        repoPath: "C:\\Users\\me\\Projects\\alpha",
        mode: "devils-advocate",
        topic: "Pricing page",
      },
    ]);
    expect(screen.queryByRole("dialog", { name: "New session" })).not.toBeInTheDocument();
  });

  it("shows an inline error and sends nothing for an empty path", () => {
    const { transport } = renderCockpit();
    fireEvent.click(screen.getByRole("button", { name: "+ NEW SESSION" }));
    const dialog = screen.getByRole("dialog", { name: "New session" });
    fireEvent.change(within(dialog).getByLabelText("Repo folder"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Repo folder path is required");
    expect(transport.sent).toEqual([]);
  });

  it("offers all four modes", () => {
    renderCockpit();
    fireEvent.click(screen.getByRole("button", { name: "+ NEW SESSION" }));
    const options = within(screen.getByLabelText("Mode")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Deep interview",
      "Quick align",
      "Brainstorm",
      "Devil's advocate",
    ]);
  });

  it("closes on Escape", () => {
    renderCockpit();
    fireEvent.click(screen.getByRole("button", { name: "+ NEW SESSION" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "New session" })).not.toBeInTheDocument();
  });
});

describe("session sidebar", () => {
  it("groups sessions by repo with status dots and switches the active session", () => {
    const { emit } = renderCockpit();
    emit({
      type: "sessions",
      sessions: [
        session({ id: "s1", title: "Alpha one", repoPath: "C:\\repos\\alpha", status: "running" }),
        session({
          id: "s2",
          title: "Beta one",
          repoPath: "C:\\repos\\beta",
          status: "waiting-for-answer",
        }),
        session({
          id: "s3",
          title: "Alpha two",
          repoPath: "C:\\repos\\alpha",
          status: "ended",
          startedAt: "2026-09-25T11:00:00Z",
        }),
      ],
    });
    const sidebar = screen.getByRole("complementary", { name: "Projects and sessions" });
    const alpha = within(sidebar).getByRole("region", { name: "alpha" });
    const beta = within(sidebar).getByRole("region", { name: "beta" });
    expect(
      within(alpha)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining("Alpha two"), expect.stringContaining("Alpha one")]);
    const betaOne = within(beta).getByRole("button", { name: /Beta one/ });
    const alphaOne = within(alpha).getByRole("button", { name: /Alpha one/ });
    const waiting = within(beta).getByTitle("waiting-for-answer");
    expect(waiting).toHaveClass("op-dot--waiting-for-answer");
    expect(within(alpha).getByTitle("ended")).toHaveClass("op-dot--ended");

    expect(alphaOne).toHaveAttribute("aria-current", "true");
    fireEvent.click(betaOne);
    expect(betaOne).toHaveAttribute("aria-current", "true");
    expect(alphaOne).not.toHaveAttribute("aria-current");
  });

  it("maps starting to the running dot", () => {
    const { emit } = renderCockpit();
    emit({ type: "session-updated", session: session({ status: "starting" }) });
    expect(screen.getByTitle("starting")).toHaveClass("op-dot--running");
  });
});

describe("session view helpers", () => {
  it("normalizes pasted Windows paths", () => {
    expect(normalizeRepoPath('  "C:\\a b\\c"  ')).toBe("C:\\a b\\c");
    expect(normalizeRepoPath("   ")).toBe("");
  });

  it("groups by repo in first-seen order", () => {
    const groups = groupSessionsByRepo([
      session({ id: "a", repoPath: "C:\\x" }),
      session({ id: "b", repoPath: "D:\\y\\" }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["x", "y"]);
  });
});
