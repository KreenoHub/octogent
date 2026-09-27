// @vitest-environment jsdom
import type { TentacleSummary } from "@octogent/octoplan-protocol";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntegrations } from "../../server/integrations";
import { TentacleCards, relativeTime } from "../../web/src/integrations/TentacleCards";
import { createFakeExec, fail, ok } from "./fakeExec";
import { makeWorkspace, plainRepoGit } from "./workspaceFixture";

afterEach(cleanup);

const F = "\x1f";

/** Summaries read from a fixture workspace with recorded git/gh, as the server builds them. */
const fixtureSummaries = async (): Promise<{ tentacles: TentacleSummary[]; workspace: string }> => {
  const ws = makeWorkspace([
    {
      id: "api",
      context: "# API Server\n\nServes the plan.\n",
      todo: "# Todo\n\n- [x] A. Done when a.\n- [x] B. Done when b.\n- [ ] C. Done when c.\n",
    },
    {
      id: "ui",
      context: "# Cockpit UI\n\nThe cockpit.\n",
      todo: "# Todo\n\n- [x] Only. Done when only.\n",
    },
    { id: "docs", context: "# Docs\n\nWords.\n", todo: "# Todo\n" },
  ]);
  try {
    const { exec } = createFakeExec({
      ...plainRepoGit(ws.root),
      "git for-each-ref": ok(
        [
          `refs/heads/main${F}m1${F}900`,
          `refs/heads/octogent/api-swarm-0${F}a1${F}1000`,
          `refs/heads/feat/ui-shell${F}u1${F}1200`,
        ].join("\n"),
      ),
      "git rev-list --left-right --count refs/heads/main...refs/heads/octogent/api-swarm-0":
        ok("1\t4\n"),
      "git rev-list --left-right --count refs/heads/main...refs/heads/feat/ui-shell": ok("0\t2\n"),
      "gh pr list": ok(
        JSON.stringify([
          {
            number: 7,
            title: "api",
            headRefName: "octogent/api-swarm-0",
            state: "OPEN",
            isDraft: false,
            url: "https://x/7",
          },
          {
            number: 8,
            title: "ui",
            headRefName: "feat/ui-shell",
            state: "MERGED",
            isDraft: false,
            url: "https://x/8",
          },
        ]),
      ),
      "gh pr checks 7": fail(8, "", JSON.stringify([{ state: "PENDING" }])),
      octogent: fail(1, "Could not reach API"),
    });
    const tentacles = await createIntegrations({ exec }).tentacleSummaries(ws.root);
    return { tentacles, workspace: ws.root };
  } finally {
    ws.cleanup();
  }
};

describe("TentacleCards (D21, D23)", () => {
  it("renders one card per fixture tentacle with progress, dots and ahead/behind", async () => {
    const { tentacles, workspace } = await fixtureSummaries();
    const onRefresh = vi.fn();
    render(
      <TentacleCards
        tentacles={tentacles}
        workspace={workspace}
        loading={false}
        onRefresh={onRefresh}
      />,
    );

    const cards = screen.getAllByTestId("tentacle-card");
    expect(cards.map((c) => c.getAttribute("data-tentacle-id"))).toEqual(["api", "docs", "ui"]);
    expect(screen.getByText("3 · 3/4 done")).toBeTruthy();

    const api = within(cards[0] as HTMLElement);
    expect(api.getByRole("heading", { name: "API Server" })).toBeTruthy();
    expect(api.getByTestId("tc-count").textContent).toBe("2/3");
    const bar = api.getByRole("img", { name: "API Server: 2 of 3 todos done" });
    expect(bar.querySelectorAll('[data-lit="true"]')).toHaveLength(6);
    expect(api.getByTestId("tc-ci-dot").getAttribute("data-status")).toBe("pending");
    expect(api.getByTestId("tc-pr-dot").getAttribute("data-status")).toBe("open");
    expect(api.getByRole("link").getAttribute("href")).toBe("https://x/7");
    expect(api.getByTestId("tc-ahead-behind").textContent).toBe("↑4↓1");

    const docs = within(cards[1] as HTMLElement);
    expect(docs.getByTestId("tc-count").textContent).toBe("0/0");
    expect(docs.getByTestId("tc-pr-dot").getAttribute("data-status")).toBe("none");
    expect(docs.getByTestId("tc-ci-dot").getAttribute("data-status")).toBe("none");
    expect(docs.getByTestId("tc-ahead-behind").textContent).toBe("no branch");

    const ui = cards[2] as HTMLElement;
    expect(ui.getAttribute("data-complete")).toBe("true");
    expect(within(ui).getByTestId("tc-pr-dot").getAttribute("data-status")).toBe("merged");
    expect(within(ui).getByTestId("tc-ahead-behind").textContent).toBe("↑2↓0");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("explains where tentacles come from when there are none", () => {
    render(
      <TentacleCards tentacles={[]} workspace="C:\\repo" loading={false} onRefresh={vi.fn()} />,
    );
    const empty = screen.getByTestId("tentacle-cards-empty");
    expect(empty.textContent).toMatch(/\.octogent\/tentacles\//);
    expect(empty.textContent).toMatch(/Hand the plan off/);
    expect(screen.queryAllByTestId("tentacle-card")).toHaveLength(0);
  });

  it("disables refresh while loading and hides the empty state", () => {
    render(<TentacleCards tentacles={[]} workspace={null} loading onRefresh={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByTestId("tentacle-cards-empty")).toBeNull();
  });

  it("formats last activity compactly", () => {
    const now = 1_000_000 * 1000;
    expect(relativeTime(1_000_000 - 30, now)).toBe("just now");
    expect(relativeTime(1_000_000 - 300, now)).toBe("5m ago");
    expect(relativeTime(1_000_000 - 3 * 3600, now)).toBe("3h ago");
    expect(relativeTime(1_000_000 - 2 * 86_400, now)).toBe("2d ago");
  });
});
