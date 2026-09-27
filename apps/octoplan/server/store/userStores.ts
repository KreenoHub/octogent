// User-level stores in ~/.octoplan (v2): session transcripts (D29) and conventions (D28).
// Contract stub seeded by the octopus; the store tentacle implements it.
import type { ConventionsStore, TranscriptStore, UserStoresOptions } from "./types";

export const TRANSCRIPTS_DIR_NAME = "transcripts";
export const CONVENTIONS_FILE_NAME = "CONVENTIONS.md";

export const createTranscriptStore = (_options: UserStoresOptions = {}): TranscriptStore => {
  throw new Error("Not implemented yet: createTranscriptStore");
};

export const createConventionsStore = (_options: UserStoresOptions = {}): ConventionsStore => {
  throw new Error("Not implemented yet: createConventionsStore");
};
