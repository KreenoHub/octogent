import type { Overview } from "@octogent/octoplan-protocol";
import { useEffect, useRef, useState } from "react";
import { tentacleProgress } from "../app/boardView";
import type { PlanJob } from "../app/planClientReducer";
import { useOctoplan } from "../app/useOctoplan";

/**
 * D42: aggregate tentacle todo progress; opens G. Pulses when the done count moves (not on the
 * first overview, and not when switching repos).
 */
export const TentaclesButton = ({
  repoPath,
  overview,
  onOpen,
}: {
  repoPath: string;
  overview: Overview | undefined;
  onOpen: () => void;
}) => {
  const progress = tentacleProgress(overview);
  const done = progress?.done ?? null;
  const [pulse, setPulse] = useState(false);
  const previous = useRef<{ repoPath: string; done: number | null }>({ repoPath, done });

  useEffect(() => {
    const before = previous.current;
    previous.current = { repoPath, done };
    if (
      before.repoPath === repoPath &&
      before.done !== null &&
      done !== null &&
      before.done !== done
    ) {
      setPulse(true);
    }
  }, [repoPath, done]);

  return (
    <button
      type="button"
      className={pulse ? "op-tentacles op-tentacles--pulse" : "op-tentacles"}
      data-testid="tentacles-button"
      title="Tentacle todos done / total — opens the overview [G]"
      onClick={onOpen}
      onAnimationEnd={() => setPulse(false)}
    >
      TENTACLES {progress ? `${progress.done}/${progress.total}` : "…"}
    </button>
  );
};

const JOB_LABELS: Record<PlanJob["job"], string> = {
  harvest: "Harvesting decisions",
  "handoff-generate": "Drafting handoff",
  "handoff-apply": "Applying handoff",
};

/** Running plan jobs for the repo as one spinner line; finished ones already toast. */
export const JobsLine = ({ repoPath }: { repoPath: string }) => {
  const { jobsByRepo } = useOctoplan();
  const running = Object.values(jobsByRepo[repoPath] ?? {}).filter(
    (job): job is PlanJob => job?.state === "running",
  );
  if (running.length === 0) return null;
  return (
    <output
      className="op-jobs"
      data-testid="plan-jobs"
      title={running.map((j) => j.message).join("\n")}
    >
      <span className="op-spinner" aria-hidden="true" />
      {running.map((job) => JOB_LABELS[job.job]).join(" · ")}…
    </output>
  );
};
