import { IngestReview } from "../integrations/ingest/IngestReview";
import { ModalFrame } from "./ModalFrame";

/** D56: the import review in a modal (wave 8 moves it into the Understand step's pane). */
export const IngestDialog = ({ repoPath, onClose }: { repoPath: string; onClose: () => void }) => (
  <ModalFrame title="What I understood" className="op-dialog--wide op-dialog--handoff">
    <IngestReview repoPath={repoPath} onClose={onClose} />
  </ModalFrame>
);
