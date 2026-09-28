// Pure text builders for the reply-card toolbar (→ task, → decision, park, ask follow-up).

export type QuotableSection = { heading: string; markdown: string };

export type CardAction = "task" | "decision" | "park";

const FOLLOW_UP_LINES = 3;

/** Markdown blockquote of a whole section: heading first, then every line. */
export const quoteSection = ({ heading, markdown }: QuotableSection): string =>
  [`**${heading}**`, ...markdown.split("\n")]
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n");

/** A short quote for the composer: heading plus the first few non-empty lines. */
export const followUpQuote = ({ heading, markdown }: QuotableSection): string => {
  const lines = markdown.split("\n").filter((line) => line.trim() !== "");
  const shown = lines.slice(0, FOLLOW_UP_LINES);
  if (lines.length > FOLLOW_UP_LINES) shown.push("…");
  return `${[`**${heading}**`, ...shown].map((line) => `> ${line}`).join("\n")}\n\n`;
};

const INSTRUCTIONS: Record<CardAction, string> = {
  task: 'Turn this section into a todo item: one "- [ ] …" task that a single agent can do without chat history, ending in "Done when …".',
  decision:
    "Record this section as a decision with plan_record_decision (title, the choice made and why).",
  park: "Park this section with plan_park: record the open point and the assumption you will work with until it is settled, then state that assumption.",
};

/** The `send-message` text for a card action: a clear instruction followed by the quoted section. */
export const cardActionMessage = (action: CardAction, section: QuotableSection): string =>
  `${INSTRUCTIONS[action]}\n\n${quoteSection(section)}`;
