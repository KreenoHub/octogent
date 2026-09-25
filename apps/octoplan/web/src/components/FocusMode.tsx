import type { Answer } from "@octogent/octoplan-protocol";
import { useId, useState } from "react";
import {
  type RoundEntry,
  selectAnsweredRounds,
  selectPendingRounds,
} from "../app/planClientReducer";
import { coverageShare, focusProgress } from "../app/sessionView";
import { useOctoplan } from "../app/useOctoplan";
import { useRoundActions } from "../app/useRoundActions";
import { QuestionRoundSlot } from "./slots";

const RoundFocus = ({
  entry,
  sessionId,
  answeredBefore,
  pending,
}: {
  entry: RoundEntry;
  sessionId: string;
  answeredBefore: RoundEntry[];
  pending: RoundEntry[];
}) => {
  const { round } = entry;
  const { answerRound, reviseAnswer } = useRoundActions(sessionId);
  const [index, setIndex] = useState(0);
  const [collected, setCollected] = useState<Record<string, Answer>>({});
  const question = round.questions[index] ?? round.questions[0];
  if (!question) return null;
  const { n, m } = focusProgress(answeredBefore, pending, index);
  const count = round.questions.length;

  const onAnswer = (answers: Answer[]) => {
    const next = { ...collected };
    for (const answer of answers) next[answer.questionId] = answer;
    setCollected(next);
    const missing = round.questions.findIndex((q) => !next[q.id]);
    if (missing === -1) {
      answerRound(
        round.id,
        round.questions.flatMap((q) => next[q.id] ?? []),
      );
      return;
    }
    const after = round.questions.findIndex((q, i) => i > index && !next[q.id]);
    setIndex(after === -1 ? missing : after);
  };

  const chosen = collected[question.id];

  return (
    <div className="op-focus-round">
      <div className="op-focus-meta">
        <span className="op-focus-progress" data-testid="focus-progress">
          {n} / ~{m}
        </span>
        <span className="op-focus-round-label">
          Round {round.index + 1} · question {index + 1} of {count}
        </span>
      </div>
      <QuestionRoundSlot
        key={question.id}
        round={{ ...round, questions: [question] }}
        {...(chosen ? { answered: [chosen] } : {})}
        onAnswer={onAnswer}
        onRevise={reviseAnswer}
      />
      <div className="op-focus-nav">
        <button
          type="button"
          className="op-button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          ← Back
        </button>
        <button
          type="button"
          className="op-button"
          disabled={count < 2}
          onClick={() => setIndex((i) => (i + 1) % count)}
        >
          Skip →
        </button>
      </div>
    </div>
  );
};

/** Full-screen, one question at a time (D6). Esc or F exits. */
export const FocusMode = ({ onExit }: { onExit: () => void }) => {
  const { state, activeSessionId, activeRepo, planByRepo } = useOctoplan();
  const titleId = useId();
  const pending = activeSessionId ? selectPendingRounds(state, activeSessionId) : [];
  const answered = activeSessionId ? selectAnsweredRounds(state, activeSessionId) : [];
  const current = pending[0];
  const coverage = Math.round(
    coverageShare(activeRepo ? planByRepo[activeRepo]?.coverage : undefined) * 100,
  );

  return (
    <dialog open className="op-focus" aria-modal="true" aria-labelledby={titleId}>
      <header className="op-focus-header">
        <h2 id={titleId} className="op-focus-title">
          Focus mode
        </h2>
        <div className="op-focus-coverage">
          <span>COVERAGE {coverage}%</span>
          <progress className="op-coverage-bar" aria-label="Coverage" value={coverage} max={100} />
        </div>
        <button type="button" className="op-button" onClick={onExit}>
          [Esc] Exit
        </button>
      </header>
      {current && activeSessionId ? (
        <RoundFocus
          key={current.round.id}
          entry={current}
          sessionId={activeSessionId}
          answeredBefore={answered}
          pending={pending}
        />
      ) : (
        <p className="op-empty op-focus-empty">No unanswered questions. Press Esc to go back.</p>
      )}
    </dialog>
  );
};
