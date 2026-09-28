import type { MessageBlock } from "@octogent/octoplan-protocol";
import { useState } from "react";
import type { CardAction } from "../app/cardActions";
import { Markdown } from "../app/markdown";
import { firstLine, isLongSection } from "../app/sessionView";

export type SectionBlock = Extract<MessageBlock, { kind: "section" }>;

export type SectionCardActions = {
  pinned: boolean;
  onTogglePin: () => void;
  onSend: (action: CardAction) => void;
  onFollowUp: () => void;
};

export const SectionCard = ({
  block,
  actions,
}: {
  block: SectionBlock;
  actions?: SectionCardActions;
}) => {
  const long = isLongSection(block.markdown);
  const [collapsed, setCollapsed] = useState(long);
  const toggle = () => setCollapsed((value) => !value);

  return (
    <article className="op-card" aria-label={block.heading} data-collapsed={collapsed}>
      <header className="op-card-header">
        <h3 className="op-card-title">{block.heading}</h3>
        {long || collapsed ? (
          <button
            type="button"
            className="op-card-toggle"
            aria-expanded={!collapsed}
            onClick={toggle}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        ) : null}
      </header>
      {actions ? (
        <div className="op-card-actions" role="toolbar" aria-label={`Actions for ${block.heading}`}>
          <button type="button" className="op-card-action" onClick={actions.onTogglePin}>
            {actions.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            className="op-card-action"
            aria-label={collapsed ? "Expand card" : "Collapse card"}
            onClick={toggle}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          <button type="button" className="op-card-action" onClick={() => actions.onSend("task")}>
            → Task
          </button>
          <button
            type="button"
            className="op-card-action"
            onClick={() => actions.onSend("decision")}
          >
            → Decision
          </button>
          <button type="button" className="op-card-action" onClick={() => actions.onSend("park")}>
            Park
          </button>
          <button type="button" className="op-card-action" onClick={actions.onFollowUp}>
            Ask follow-up
          </button>
        </div>
      ) : null}
      {collapsed ? (
        <p className="op-card-preview">{firstLine(block.markdown)}</p>
      ) : (
        <div className="op-card-body">
          <Markdown text={block.markdown} />
        </div>
      )}
    </article>
  );
};
