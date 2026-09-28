import type { Answer, AnswerModifier, Question } from "@octogent/octoplan-protocol";

// Editable state of one question while a round (or a revision) is open.
export type QuestionDraft = {
  selected: string[];
  otherActive: boolean;
  otherText: string;
  modifier: AnswerModifier;
  assumption: string;
  cursor: number;
};

const RECOMMENDED_SUFFIX = "(Recommended)";

export const isRecommended = (label: string): boolean =>
  label.trimEnd().endsWith(RECOMMENDED_SUFFIX);

export const recommendedLabel = (question: Question): string =>
  question.options.find((option) => isRecommended(option.label))?.label ?? "";

export const hasPreviews = (question: Question): boolean =>
  question.options.some((option) => option.preview !== undefined);

export const emptyDraft = (): QuestionDraft => ({
  selected: [],
  otherActive: false,
  otherText: "",
  modifier: "none",
  assumption: "",
  cursor: 0,
});

export const draftFromAnswer = (question: Question, answer: Answer | undefined): QuestionDraft => {
  if (!answer) {
    return emptyDraft();
  }
  const labels = new Set(question.options.map((option) => option.label));
  const selected = answer.selected.filter((label) => labels.has(label));
  const firstSelected = question.options.findIndex((option) => option.label === selected[0]);
  return {
    selected,
    otherActive: Boolean(answer.otherText),
    otherText: answer.otherText ?? "",
    modifier: answer.modifier,
    assumption: answer.assumption ?? "",
    cursor: Math.max(firstSelected, 0),
  };
};

const orderedSelection = (question: Question, labels: Set<string>): string[] =>
  question.options.map((option) => option.label).filter((label) => labels.has(label));

// Single-select picks the option (and drops Other); multi-select toggles it.
export const pickOption = (
  question: Question,
  draft: QuestionDraft,
  index: number,
): QuestionDraft => {
  const option = question.options[index];
  if (!option) {
    return draft;
  }
  if (!question.multiSelect) {
    return { ...draft, selected: [option.label], otherActive: false, cursor: index };
  }
  const next = new Set(draft.selected);
  if (next.has(option.label)) {
    next.delete(option.label);
  } else {
    next.add(option.label);
  }
  return { ...draft, selected: orderedSelection(question, next), cursor: index };
};

export const moveCursor = (
  question: Question,
  draft: QuestionDraft,
  delta: number,
): QuestionDraft => {
  const last = question.options.length - 1;
  return { ...draft, cursor: Math.min(Math.max(draft.cursor + delta, 0), last) };
};

export const activateOther = (question: Question, draft: QuestionDraft): QuestionDraft =>
  question.multiSelect
    ? { ...draft, otherActive: true }
    : { ...draft, otherActive: true, selected: [] };

export const setOtherText = (
  question: Question,
  draft: QuestionDraft,
  text: string,
): QuestionDraft => ({
  ...activateOther(question, draft),
  otherText: text,
});

export const toggleTentative = (draft: QuestionDraft): QuestionDraft =>
  draft.modifier === "tentative"
    ? { ...draft, modifier: "none" }
    : { ...draft, modifier: "tentative", assumption: "" };

export const togglePark = (question: Question, draft: QuestionDraft): QuestionDraft =>
  draft.modifier === "parked"
    ? { ...draft, modifier: "none", assumption: "" }
    : { ...draft, modifier: "parked", assumption: recommendedLabel(question) };

const trimmedOther = (draft: QuestionDraft): string =>
  draft.otherActive ? draft.otherText.trim() : "";

// A parked question counts as answered even with nothing selected.
export const isDraftAnswered = (draft: QuestionDraft): boolean =>
  draft.modifier === "parked" || draft.selected.length > 0 || trimmedOther(draft).length > 0;

export const draftToAnswer = (
  question: Question,
  draft: QuestionDraft,
  answeredAt: string,
  revise = false,
): Answer => {
  const otherText = trimmedOther(draft);
  return {
    questionId: question.id,
    selected: [...draft.selected],
    ...(otherText ? { otherText } : {}),
    modifier: draft.modifier,
    ...(draft.modifier === "parked" ? { assumption: draft.assumption.trim() } : {}),
    ...(revise ? { revisionOf: question.id } : {}),
    answeredAt,
  };
};

// Human-readable chosen labels, the same join Claude sees for the base answer.
export const answerLabel = (answer: Answer): string => {
  const parts = [...answer.selected];
  if (answer.otherText?.trim()) {
    parts.push(answer.otherText.trim());
  }
  return parts.length > 0 ? parts.join(", ") : "—";
};

// Answers per question in the order they were given; the last entry is current.
export const buildChains = (answers: readonly Answer[]): Map<string, Answer[]> => {
  const chains = new Map<string, Answer[]>();
  const sorted = answers
    .map((answer, position) => ({ answer, position }))
    .sort((a, b) =>
      a.answer.answeredAt === b.answer.answeredAt
        ? a.position - b.position
        : a.answer.answeredAt < b.answer.answeredAt
          ? -1
          : 1,
    );
  for (const { answer } of sorted) {
    const chain = chains.get(answer.questionId) ?? [];
    chain.push(answer);
    chains.set(answer.questionId, chain);
  }
  return chains;
};
