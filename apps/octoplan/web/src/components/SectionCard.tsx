import type { MessageBlock } from "@octogent/octoplan-protocol";
import { useState } from "react";
import { firstLine, isLongSection } from "../app/sessionView";

type SectionBlock = Extract<MessageBlock, { kind: "section" }>;

export const SectionCard = ({ block }: { block: SectionBlock }) => {
  const long = isLongSection(block.markdown);
  const [expanded, setExpanded] = useState(false);
  const collapsed = long && !expanded;

  return (
    <article className="op-card" aria-label={block.heading} data-collapsed={collapsed}>
      <header className="op-card-header">
        <h3 className="op-card-title">{block.heading}</h3>
        {long ? (
          <button
            type="button"
            className="op-card-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        ) : null}
      </header>
      {collapsed ? (
        <p className="op-card-preview">{firstLine(block.markdown)}</p>
      ) : (
        <div className="op-card-body">{block.markdown}</div>
      )}
    </article>
  );
};
