// @vitest-environment jsdom
import type { CoverageState } from "@octogent/octoplan-protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageMap } from "../../web/src/components/coverage";

const mixed: CoverageState = {
  dimensions: [
    { id: "problem", status: "covered", confidence: "high", questionIds: ["Q1"], note: "Churn" },
    { id: "scope", status: "partial", confidence: "medium", questionIds: ["Q2"], note: "" },
    { id: "flows", status: "unknown", confidence: "low", questionIds: [], note: "" },
    { id: "success", status: "covered", confidence: "low", questionIds: ["Q3"], note: "DoD set" },
  ],
};

describe("CoverageMap", () => {
  it("renders one row per dimension with its status and the covered count", () => {
    render(<CoverageMap coverage={mixed} dimensions={["problem", "scope", "flows", "success"]} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-status"))).toEqual([
      "covered",
      "partial",
      "unknown",
      "covered",
    ]);
    expect(screen.getByText("Problem & why")).toBeInTheDocument();
    expect(screen.getByText("Success metrics & DoD")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-count")).toHaveTextContent("2/4 covered");
    expect(rows[0]).toHaveAttribute("title", "Churn");
    expect(rows[2]).not.toHaveAttribute("title");
    expect(rows[1]?.querySelector("[data-confidence]")).toHaveAttribute(
      "data-confidence",
      "medium",
    );
  });

  it("shows dimensions missing from the state as unknown, in the order given", () => {
    render(<CoverageMap coverage={mixed} dimensions={["ops", "problem"]} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-dimension"))).toEqual(["ops", "problem"]);
    expect(rows[0]).toHaveAttribute("data-status", "unknown");
    expect(screen.getByTestId("coverage-count")).toHaveTextContent("1/2 covered");
  });

  it("falls back to the state's own dimensions", () => {
    render(<CoverageMap coverage={mixed} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
