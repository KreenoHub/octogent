import type { MessageBlock } from "@octogent/octoplan-protocol";
import { useState } from "react";
import { cardActionMessage, followUpQuote } from "../app/cardActions";
import { useExpandAll } from "../app/expandAll";
import { selectPendingRounds } from "../app/planClientReducer";
import { groupStream, latestProse } from "../app/streamView";
import { useOctoplan } from "../app/useOctoplan";
import { roundAnchorId, useRoundActions } from "../app/useRoundActions";
import { AnswerDock, focusDock } from "./AnswerDock";
import { Composer, type ComposerPrefill } from "./Composer";
import { PinnedStrip, sectionAnchorId } from "./PinnedStrip";
import { type SectionBlock, SectionCard, type SectionCardActions } from "./SectionCard";
import { ToolGroupRow, ToolRow } from "./ToolRows";
import { QuestionRoundSlot } from "./slots";

const EMPTY: MessageBlock[] = [];

/** A round in the stream: a one-line stub while it waits in the dock, the answered card after. */
const RoundView = ({ roundId, sessionId }: { roundId: string; sessionId: string }) => {
  const { rounds } = useOctoplan();
  const expandAll = useExpandAll();
  const { answerRound, reviseAnswer } = useRoundActions(sessionId);
  const entry = rounds[roundId];
  if (!entry) {
    return (
      <div className="op-round" id={roundAnchorId(roundId)}>
        <p className="op-empty">Waiting for question round…</p>
      </div>
    );
  }
  const { round } = entry;
  if (entry.status === "pending") {
    return (
      <div className="op-round" id={roundAnchorId(roundId)}>
        <button
          type="button"
          className="op-round-stub"
          data-testid="round-stub"
          onClick={focusDock}
        >
          <span className="op-round-stub-label">ROUND {round.index}</span>
          <span className="op-round-stub-headers">
            {round.questions.map((q) => q.header || q.question).join(" · ")}
          </span>
          <span className="op-round-stub-hint">answer in the dock ↓</span>
        </button>
      </div>
    );
  }
  return (
    <div className="op-round" id={roundAnchorId(roundId)}>
      <QuestionRoundSlot
        round={round}
        answered={entry.answers}
        compact={!expandAll}
        onAnswer={(answers) => answerRound(round.id, answers)}
        onRevise={reviseAnswer}
      />
    </div>
  );
};

const BlockView = ({
  block,
  sessionId,
  sectionActions,
}: {
  block: MessageBlock;
  sessionId: string;
  sectionActions: (section: SectionBlock) => SectionCardActions;
}) => {
  switch (block.kind) {
    case "user":
      return (
        <div className="op-bubble-row">
          <p className="op-bubble">{block.text}</p>
        </div>
      );
    case "tool":
      return <ToolRow tool={block} />;
    case "section":
      return (
        <div id={sectionAnchorId(block.id)}>
          <SectionCard block={block} actions={sectionActions(block)} />
        </div>
      );
    case "question-round":
      return <RoundView roundId={block.roundId} sessionId={sessionId} />;
  }
};

const NO_PINS: string[] = [];

export const ConversationPane = ({ onFocus }: { onFocus: () => void }) => {
  const { state, activeSessionId, blocksBySession, sendClientEvent } = useOctoplan();
  const blocks = activeSessionId ? (blocksBySession[activeSessionId] ?? EMPTY) : EMPTY;
  const pending = activeSessionId ? selectPendingRounds(state, activeSessionId) : [];
  const [pinsBySession, setPinsBySession] = useState<Record<string, string[]>>({});
  const [prefill, setPrefill] = useState<ComposerPrefill | null>(null);
  const pinnedIds = activeSessionId ? (pinsBySession[activeSessionId] ?? NO_PINS) : NO_PINS;
  const pinned = pinnedIds.flatMap((id) => {
    const block = blocks.find((b) => b.id === id);
    return block?.kind === "section" ? [block] : [];
  });

  const togglePin = (blockId: string) => {
    if (!activeSessionId) return;
    setPinsBySession((prev) => {
      const current = prev[activeSessionId] ?? [];
      const next = current.includes(blockId)
        ? current.filter((id) => id !== blockId)
        : [...current, blockId];
      return { ...prev, [activeSessionId]: next };
    });
  };

  const sectionActions = (section: SectionBlock): SectionCardActions => ({
    pinned: pinnedIds.includes(section.id),
    onTogglePin: () => togglePin(section.id),
    onSend: (action) => {
      if (!activeSessionId) return;
      sendClientEvent({
        type: "send-message",
        sessionId: activeSessionId,
        text: cardActionMessage(action, section),
      });
    },
    onFollowUp: () =>
      setPrefill((prev) => ({ text: followUpQuote(section), nonce: (prev?.nonce ?? 0) + 1 })),
  });

  return (
    <section className="op-pane op-pane--center op-conversation" aria-label="Conversation">
      <h2 className="op-pane-title">CONVERSATION</h2>
      <PinnedStrip sections={pinned} onUnpin={togglePin} />
      <div className="op-stream" data-testid="stream">
        {!activeSessionId ? (
          <p className="op-empty">Start a session to begin. Questions appear here as cards.</p>
        ) : blocks.length === 0 ? (
          <p className="op-empty">Waiting for Claude…</p>
        ) : (
          groupStream(blocks).map((item) =>
            item.kind === "tools" ? (
              <ToolGroupRow key={item.id} tools={item.tools} />
            ) : (
              <BlockView
                key={item.block.id}
                block={item.block}
                sessionId={activeSessionId}
                sectionActions={sectionActions}
              />
            ),
          )
        )}
      </div>
      {activeSessionId ? (
        <AnswerDock
          sessionId={activeSessionId}
          pending={pending}
          latest={latestProse(blocks)}
          onFocus={onFocus}
        />
      ) : null}
      <Composer sessionId={activeSessionId} prefill={prefill} />
    </section>
  );
};
