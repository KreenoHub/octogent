import {
  type CoverageDimension,
  type CoverageDimensionId,
  type CoverageState,
  type CoverageStatus,
  type ModeId,
  type Question,
  confidenceSchema,
  coverageDimensionIdSchema,
  coverageStatusSchema,
} from "@octogent/octoplan-protocol";
import { z } from "zod";
import { getMode } from "./definitions";
import type { ApplyCoverageUpdate, CoverageUpdate, ModeDefinition } from "./types";

/** zod schema for the `plan_update_coverage` tool input; mirrors `CoverageUpdate`. */
export const coverageUpdateSchema = z.object({
  id: coverageDimensionIdSchema,
  status: coverageStatusSchema.optional(),
  confidence: confidenceSchema.optional(),
  note: z.string().optional(),
  questionIds: z.array(z.string()).optional(),
  regress: z.boolean().optional(),
});

const STATUS_RANK: Record<CoverageStatus, number> = { unknown: 0, partial: 1, covered: 2 };

const blankDimension = (id: CoverageDimensionId): CoverageDimension => ({
  id,
  status: "unknown",
  confidence: "low",
  questionIds: [],
  note: "",
});

type ModeRef = ModeId | Pick<ModeDefinition, "dimensions">;

export const initialCoverage = (mode: ModeRef): CoverageState => {
  const dimensions = typeof mode === "string" ? getMode(mode).dimensions : mode.dimensions;
  return { dimensions: dimensions.map(blankDimension) };
};

const mergeQuestionIds = (current: readonly string[], incoming: readonly string[] = []) => {
  const merged = [...current];
  for (const raw of incoming) {
    const id = raw.trim();
    if (id.length > 0 && !merged.includes(id)) merged.push(id);
  }
  return merged;
};

const nextStatus = (current: CoverageStatus, update: CoverageUpdate): CoverageStatus => {
  if (!update.status) return current;
  if (update.regress) return update.status;
  return STATUS_RANK[update.status] > STATUS_RANK[current] ? update.status : current;
};

/**
 * Applies one `plan_update_coverage` payload. Pure: returns a new state.
 * Status only moves forward unless `regress: true`; question ids are merged
 * without duplicates; a blank note keeps the previous one. An update for a
 * dimension outside the mode is appended rather than dropped.
 */
export const applyCoverageUpdate: ApplyCoverageUpdate = (state, update) => {
  const exists = state.dimensions.some((dimension) => dimension.id === update.id);
  const dimensions = exists ? state.dimensions : [...state.dimensions, blankDimension(update.id)];
  return {
    dimensions: dimensions.map((dimension) => {
      if (dimension.id !== update.id) return dimension;
      const note = update.note?.trim();
      return {
        id: dimension.id,
        status: nextStatus(dimension.status, update),
        confidence: update.confidence ?? dimension.confidence,
        questionIds: mergeQuestionIds(dimension.questionIds, update.questionIds),
        note: note ? note : dimension.note,
      };
    }),
  };
};

/**
 * Folds answered questions into coverage: each question tagged with a dimension
 * is linked to it, and an `unknown` dimension becomes `partial` (an answer
 * means something is known). Claude's `plan_update_coverage` calls decide the rest.
 */
export const applyAnsweredQuestions = (
  state: CoverageState,
  questions: readonly Pick<Question, "id" | "dimension">[],
): CoverageState => {
  let current = state;
  for (const question of questions) {
    if (!question.dimension) continue;
    current = applyCoverageUpdate(current, {
      id: question.dimension,
      status: "partial",
      questionIds: [question.id],
    });
  }
  return current;
};

/** Share of dimensions that are `covered`, 0–1. Drives the focus-mode progress bar. */
export const coverageScore = (state: CoverageState): number => {
  if (state.dimensions.length === 0) return 0;
  const covered = state.dimensions.filter((dimension) => dimension.status === "covered").length;
  return covered / state.dimensions.length;
};
