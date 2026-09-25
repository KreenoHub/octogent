// Turns Claude's replies into cards: one section per markdown heading, so long
// replies collapse and pin per topic instead of arriving as a wall of text.
export type Section = { heading: string; markdown: string };

const HEADING_RE = /^#{1,6}\s+(.*)$/;

export const splitSections = (text: string): Section[] => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let heading = "";
  let body: string[] = [];
  let inFence = false;

  const flush = () => {
    const markdown = body.join("\n").trim();
    if (markdown || heading) sections.push({ heading, markdown });
    body = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = inFence ? null : HEADING_RE.exec(line);
    if (match) {
      flush();
      heading = (match[1] ?? "").trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** One-line description of a tool call for the conversation stream. */
export const summarizeToolUse = (name: string, input: unknown): string => {
  const args = (input ?? {}) as Record<string, unknown>;
  const short = name.replace(/^mcp__octoplan__/, "");
  const detail =
    str(args.file_path) ||
    str(args.pattern) ||
    str(args.path) ||
    str(args.title) ||
    str(args.id) ||
    "";
  return detail ? `${short} · ${detail}` : short;
};
