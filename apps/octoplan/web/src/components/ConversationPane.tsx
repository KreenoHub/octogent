import type { MessageBlock } from "@octogent/octoplan-protocol";
import { selectPendingRounds } from "../app/planClientReducer";
import { useOctoplan } from "../app/useOctoplan";
import { roundAnchorId, useRoundActions } from "../app/useRoundActions";
import { Composer } from "./Composer";
import { SectionCard } from "./SectionCard";
import { UnansweredTray } from "./UnansweredTray";
import { QuestionRoundSlot } from "./slots";

const EMPTY: MessageBlock[] = [];

const BlockView = ({ block, sessionId }: { block: MessageBlock; sessionId: string }) => {
  const { rounds } = useOctoplan();
  const { answerRound, reviseAnswer } = useRoundActions(sessionId);
  switch (block.kind) {
    case "user":
      return (
        <div className="op-bubble-row">
          <p className="op-bubble">{block.text}</p>
        </div>
      );
    case "tool":
      return (
        <div className="op-tool-row" data-testid="tool-row" title={block.summary}>
          <span className="op-tool-name">{block.name}</span>
          <span className="op-tool-summary">{block.summary}</span>
        </div>
      );
    case "section":
      return <SectionCard block={block} />;
    case "question-round": {
      const entry = rounds[block.roundId];
      return (
        <div className="op-round" id={roundAnchorId(block.roundId)}>
          {entry ? (
            <QuestionRoundSlot
              round={entry.round}
              {...(entry.status === "answered" ? { answered: entry.answers } : {})}
              onAnswer={(answers) => answerRound(entry.round.id, answers)}
              onRevise={reviseAnswer}
            />
          ) : (
            <p className="op-empty">Waiting for question round…</p>
          )}
        </div>
      );
    }
  }
};

export const ConversationPane = ({ onFocus }: { onFocus: () => void }) => {
  const { state, activeSessionId, blocksBySession } = useOctoplan();
  const blocks = activeSessionId ? (blocksBySession[activeSessionId] ?? EMPTY) : EMPTY;
  const pending = activeSessionId ? selectPendingRounds(state, activeSessionId) : [];

  return (
    <section className="op-pane op-pane--center op-conversation" aria-label="Conversation">
      <h2 className="op-pane-title">CONVERSATION</h2>
      <UnansweredTray pending={pending} onFocus={onFocus} />
      <div className="op-stream">
        {!activeSessionId ? (
          <p className="op-empty">Start a session to begin. Questions appear here as cards.</p>
        ) : blocks.length === 0 ? (
          <p className="op-empty">Waiting for Claude…</p>
        ) : (
          blocks.map((block) => (
            <BlockView key={block.id} block={block} sessionId={activeSessionId} />
          ))
        )}
      </div>
      <Composer sessionId={activeSessionId} />
    </section>
  );
};
