import type { MessageBlock } from "@octogent/octoplan-protocol";
import { useState } from "react";
import { cardActionMessage, followUpQuote } from "../app/cardActions";
import { selectPendingRounds } from "../app/planClientReducer";
import { useOctoplan } from "../app/useOctoplan";
import { roundAnchorId, useRoundActions } from "../app/useRoundActions";
import { Composer, type ComposerPrefill } from "./Composer";
import { PinnedStrip, sectionAnchorId } from "./PinnedStrip";
import { type SectionBlock, SectionCard, type SectionCardActions } from "./SectionCard";
import { UnansweredTray } from "./UnansweredTray";
import { QuestionRoundSlot } from "./slots";

const EMPTY: MessageBlock[] = [];

const BlockView = ({
  block,
  sessionId,
  sectionActions,
}: {
  block: MessageBlock;
  sessionId: string;
  sectionActions: (section: SectionBlock) => SectionCardActions;
}) => {
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
      return (
        <div id={sectionAnchorId(block.id)}>
          <SectionCard block={block} actions={sectionActions(block)} />
        </div>
      );
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
      <UnansweredTray pending={pending} onFocus={onFocus} />
      <div className="op-stream">
        {!activeSessionId ? (
          <p className="op-empty">Start a session to begin. Questions appear here as cards.</p>
        ) : blocks.length === 0 ? (
          <p className="op-empty">Waiting for Claude…</p>
        ) : (
          blocks.map((block) => (
            <BlockView
              key={block.id}
              block={block}
              sessionId={activeSessionId}
              sectionActions={sectionActions}
            />
          ))
        )}
      </div>
      <Composer sessionId={activeSessionId} prefill={prefill} />
    </section>
  );
};
