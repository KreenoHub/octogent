import type { Answer } from "@octogent/octoplan-protocol";
import { useCallback } from "react";
import { useOctoplan } from "./useOctoplan";

/** answer-round / revise-answer senders for one session, shared by the stream and focus mode. */
export const useRoundActions = (sessionId: string | null) => {
  const { sendClientEvent } = useOctoplan();
  const answerRound = useCallback(
    (roundId: string, answers: Answer[]) => {
      if (sessionId) sendClientEvent({ type: "answer-round", sessionId, roundId, answers });
    },
    [sendClientEvent, sessionId],
  );
  const reviseAnswer = useCallback(
    (answer: Answer) => {
      if (sessionId) sendClientEvent({ type: "revise-answer", sessionId, answer });
    },
    [sendClientEvent, sessionId],
  );
  return { answerRound, reviseAnswer };
};

/** DOM id of a round's place in the stream (stub while pending, answered card after). */
export const roundAnchorId = (roundId: string) => `op-round-${roundId}`;
