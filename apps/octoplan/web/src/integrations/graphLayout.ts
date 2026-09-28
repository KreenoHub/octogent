// Pure geometry for the branch graph SVG: one row per commit, one column per lane.
import type { GitCommitNode, GitGraph, PrStatus } from "@octogent/octoplan-protocol";

export const ROW_H = 24;
export const LANE_W = 14;
export const PAD_X = 8;
export const LANE_COLORS = 6;

export type GraphDot = { hash: string; lane: number; x: number; y: number; merge: boolean };
export type GraphEdge = { key: string; d: string; lane: number };
export type GraphLayout = { width: number; height: number; dots: GraphDot[]; edges: GraphEdge[] };

export const laneX = (lane: number) => PAD_X + lane * LANE_W + LANE_W / 2;
export const rowY = (row: number) => row * ROW_H + ROW_H / 2;

export const layoutGraph = (commits: readonly GitCommitNode[]): GraphLayout => {
  const rowOf = new Map(commits.map((c, i) => [c.hash, i]));
  const maxLane = commits.reduce((max, c) => Math.max(max, c.lane), 0);
  const height = Math.max(commits.length, 1) * ROW_H;
  const dots: GraphDot[] = [];
  const edges: GraphEdge[] = [];

  commits.forEach((commit, row) => {
    const x1 = laneX(commit.lane);
    const y1 = rowY(row);
    dots.push({
      hash: commit.hash,
      lane: commit.lane,
      x: x1,
      y: y1,
      merge: commit.parents.length > 1,
    });

    commit.parents.forEach((parent, index) => {
      const key = `${commit.hash}-${parent}`;
      const parentRow = rowOf.get(parent);
      if (parentRow === undefined) {
        // parent is outside the 400-commit window: a stub that runs off the bottom
        edges.push({ key, d: `M${x1} ${y1} L${x1} ${height}`, lane: commit.lane });
        return;
      }
      const parentLane = commits[parentRow]?.lane ?? commit.lane;
      const x2 = laneX(parentLane);
      const y2 = rowY(parentRow);
      const half = ROW_H / 2;
      if (x1 === x2) {
        edges.push({ key, d: `M${x1} ${y1} L${x2} ${y2}`, lane: commit.lane });
      } else if (index === 0) {
        // a branch: stay in our lane, bend into the parent's lane one row above it
        const bend = y2 - ROW_H;
        edges.push({
          key,
          d: `M${x1} ${y1} L${x1} ${bend} C${x1} ${bend + half} ${x2} ${bend + half} ${x2} ${y2}`,
          lane: commit.lane,
        });
      } else {
        // a merge: leave at once for the merged parent's lane, then run down it
        const bend = y1 + ROW_H;
        edges.push({
          key,
          d: `M${x1} ${y1} C${x1} ${y1 + half} ${x2} ${y1 + half} ${x2} ${bend} L${x2} ${y2}`,
          lane: parentLane,
        });
      }
    });
  });

  return { width: PAD_X * 2 + (maxLane + 1) * LANE_W, height, dots, edges };
};

/** `origin/feat/x` -> `feat/x`; PR head refs and conversation links use the local name. */
export const localName = (branch: string, isRemote: boolean) =>
  isRemote ? branch.slice(branch.indexOf("/") + 1) : branch;

export const prForBranch = (
  graph: GitGraph,
  branch: string,
  isRemote: boolean,
): PrStatus | undefined => {
  const name = localName(branch, isRemote);
  const matching = graph.prs.filter((pr) => pr.headRef === name);
  return matching.find((pr) => pr.state === "open") ?? matching[0];
};

export const isBranchRef = (ref: string) => ref !== "HEAD" && !ref.startsWith("tag: ");
