import type { MessageBlock } from "@octogent/octoplan-protocol";
import type { CardAction } from "../app/cardActions";
import { useExpandable } from "../app/expandAll";
import { Markdown } from "../app/markdown";
import { firstLine } from "../app/sessionView";
import { digestTitle, isDigestable } from "../app/streamView";

export type SectionBlock = Extract<MessageBlock, { kind: "section" }>;

export type SectionCardActions = {
  pinned: boolean;
  onTogglePin: () => void;
  onSend: (action: CardAction) => void;
  onFollowUp: () => void;
};

/**
 * One prose section of a reply. D15: anything longer than a line folds to a one-line digest
 * (heading, then the first line dimmed) that expands on click; the stored markdown is untouched.
 */
export const SectionCard = ({
  block,
  actions,
}: {
  block: SectionBlock;
  actions?: SectionCardActions;
}) => {
  const [collapsed, toggle] = useExpandable(isDigestable(block.markdown));
  const title = digestTitle(block);
  const preview = block.heading.trim() ? firstLine(block.markdown) : "";

  return (
    <article className="op-card" aria-label={block.heading} data-collapsed={collapsed}>
      {collapsed ? (
        <button
          type="button"
          className="op-digest"
          aria-expanded={false}
          title="Expand"
          data-testid="prose-digest"
          onClick={toggle}
        >
          <span className="op-digest-title">{title}</span>
          {preview ? <span className="op-digest-line">{preview}</span> : null}
        </button>
      ) : (
        <header className="op-card-header">
          <h3 className="op-card-title">{block.heading}</h3>
          {isDigestable(block.markdown) ? (
            <button type="button" className="op-card-toggle" aria-expanded onClick={toggle}>
              Collapse
            </button>
          ) : null}
        </header>
      )}
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
      {collapsed ? null : (
        <div className="op-card-body">
          <Markdown text={block.markdown} />
        </div>
      )}
    </article>
  );
};
