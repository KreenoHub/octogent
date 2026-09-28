// @vitest-environment jsdom
import type { Idea } from "@octogent/octoplan-protocol";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrainstormBoard } from "../../web/src/components/brainstorm";

const idea = (id: string, status: Idea["status"], title = `Idea ${id}`): Idea => ({
  id,
  title,
  date: "2026-09-27",
  tags: ["ux"],
  status,
  body: `Body of ${id}`,
});

const ideas: Idea[] = [
  idea("I1", "inbox", "Weekly digest"),
  idea("I2", "starred", "In-app inbox"),
  idea("I3", "parked", "SMS"),
  idea("I4", "killed", "Fax"),
  idea("I5", "merged", "Pager"),
  idea("I6", "adopted", "Email"),
];

const setup = (list: Idea[] = ideas) => {
  const onAction = vi.fn();
  const onConverge = vi.fn();
  render(<BrainstormBoard ideas={list} onAction={onAction} onConverge={onConverge} />);
  return { onAction, onConverge };
};

const column = (name: RegExp) => screen.getByRole("region", { name });
const card = (title: string) => screen.getByRole("article", { name: new RegExp(title) });

describe("BrainstormBoard", () => {
  it("sorts ideas into Inbox, Starred, Parked and a collapsed Done column", () => {
    setup();
    expect(within(column(/^Inbox/)).getByText("Weekly digest")).toBeInTheDocument();
    expect(within(column(/^Starred/)).getByText("In-app inbox")).toBeInTheDocument();
    expect(within(column(/^Parked/)).getByText("SMS")).toBeInTheDocument();
    const done = column(/^Done/);
    expect(within(done).getByText(/Done \(3\)/)).toBeInTheDocument();
    const details = done.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(within(done).getByText("Fax")).toBeInTheDocument();
  });

  it("shows only the legal actions for each card", () => {
    setup();
    const names = (title: string) =>
      within(card(title))
        .queryAllByRole("button")
        .map((b) => b.textContent);
    expect(names("Weekly digest")).toEqual(["Star", "Park", "Kill", "Adopt", "Merge"]);
    expect(names("In-app inbox")).toEqual(["Park", "Kill", "Adopt", "Merge"]);
    expect(names("SMS")).toEqual(["Reopen"]);
    expect(names("Fax")).toEqual(["Reopen"]);
    expect(names("Pager")).toEqual([]);
    expect(names("Email")).toEqual([]);
  });

  it("calls onAction with the idea id and action", () => {
    const { onAction } = setup();
    fireEvent.click(within(card("Weekly digest")).getByRole("button", { name: "Star" }));
    expect(onAction).toHaveBeenCalledWith("I1", "star");
    fireEvent.click(within(card("SMS")).getByRole("button", { name: "Reopen" }));
    expect(onAction).toHaveBeenCalledWith("I3", "reopen");
  });

  it("merges into the target picked from the select, which lists only valid targets", () => {
    const { onAction } = setup();
    const inbox = card("Weekly digest");
    const select = within(inbox).getByRole("combobox", { name: /merge I1 into/i });
    const options = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(["I2", "I3", "I6"]);
    const merge = within(inbox).getByRole("button", { name: "Merge" });
    fireEvent.change(select, { target: { value: "I3" } });
    fireEvent.click(merge);
    expect(onAction).toHaveBeenCalledWith("I1", "merge", "I3");
  });

  it("disables Converge with nothing starred and enables it with starred ideas", () => {
    const { onConverge } = setup();
    const converge = screen.getByRole("button", { name: "Converge (1 starred)" });
    expect(converge).toBeEnabled();
    fireEvent.click(converge);
    expect(onConverge).toHaveBeenCalledTimes(1);
  });

  it("disables Converge at 0 starred", () => {
    const { onConverge } = setup([idea("I1", "inbox")]);
    const converge = screen.getByRole("button", { name: "Converge (0 starred)" });
    expect(converge).toBeDisabled();
    fireEvent.click(converge);
    expect(onConverge).not.toHaveBeenCalled();
  });

  it("uses real buttons and labelled controls so it works from the keyboard", () => {
    setup();
    for (const button of screen.getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveAttribute("type", "button");
    }
    const summary = column(/^Done/).querySelector("summary");
    expect(summary).not.toBeNull();
  });

  it("shows an empty hint per column", () => {
    setup([]);
    expect(within(column(/^Inbox/)).getByText(/No ideas/i)).toBeInTheDocument();
  });
});
