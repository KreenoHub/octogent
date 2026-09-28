import type { Answer, Question } from "./domain";

// AskUserQuestion answers reach Claude as plain strings keyed by question text.
// Modifiers must therefore be spelled out in the string itself; the mode system
// prompts teach Claude to honor these exact markers.
export const PARKED_MARKER = "PARKED";
export const TENTATIVE_MARKER = "TENTATIVE";
export const REVISION_MARKER = "REVISION";

export const encodeAnswerText = (answer: Answer): string => {
  const chosen = [...answer.selected];
  if (answer.otherText && answer.otherText.trim().length > 0) {
    chosen.push(answer.otherText.trim());
  }
  const base = chosen.join(", ");

  if (answer.modifier === "parked") {
    const assumption = answer.assumption?.trim() || base || "your recommended option";
    return `${PARKED_MARKER} — proceed assuming "${assumption}"; this is logged in PARKED.md.`;
  }
  if (answer.modifier === "tentative") {
    return `${base} (${TENTATIVE_MARKER} — log as a risk, re-ask if it matters)`;
  }
  return base;
};

// Shape expected by AskUserQuestion's `answers` field: question text -> answer string.
export const encodeAnswersForTool = (
  questions: readonly Question[],
  answers: readonly Answer[],
): Record<string, string> => {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const result: Record<string, string> = {};
  for (const question of questions) {
    const answer = byId.get(question.id);
    if (answer) {
      result[question.question] = encodeAnswerText(answer);
    }
  }
  return result;
};

export const encodeRevisionTurn = (input: {
  questionId: string;
  previous: string;
  next: string;
  dependentDecisionIds: readonly string[];
}): string => {
  const deps =
    input.dependentDecisionIds.length > 0
      ? input.dependentDecisionIds.join(", ")
      : "(none recorded)";
  return `${REVISION_MARKER} of ${input.questionId}: was "${input.previous}", now "${input.next}". Re-check decisions ${deps} that depended on it and report what changes.`;
};
