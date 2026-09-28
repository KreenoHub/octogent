import { firstLine } from "../app/sessionView";
import type { SectionBlock } from "./SectionCard";

export const sectionAnchorId = (blockId: string) => `op-section-${blockId}`;

/** Pinned reply sections, kept at the top of the conversation. Click jumps to the card. */
export const PinnedStrip = ({
  sections,
  onUnpin,
}: {
  sections: SectionBlock[];
  onUnpin: (blockId: string) => void;
}) => {
  if (sections.length === 0) return null;
  return (
    <section className="op-pinned" aria-label="Pinned">
      <span className="op-pinned-title">PINNED</span>
      <ul className="op-pinned-list">
        {sections.map((section) => (
          <li key={section.id} className="op-pinned-item">
            <button
              type="button"
              className="op-pinned-jump"
              title={firstLine(section.markdown)}
              onClick={() =>
                document
                  .getElementById(sectionAnchorId(section.id))
                  ?.scrollIntoView?.({ block: "start", behavior: "smooth" })
              }
            >
              {section.heading}
            </button>
            <button
              type="button"
              className="op-pinned-unpin"
              aria-label={`Unpin ${section.heading}`}
              onClick={() => onUnpin(section.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
