import { ModalFrame } from "./ModalFrame";
import { HandoffSlot } from "./slots";

/** D44: the plan → Octogent handoff wizard (integrations' HandoffWizard) in a modal. */
export const HandoffDialog = ({ repoPath, onClose }: { repoPath: string; onClose: () => void }) => (
  <ModalFrame title="Hand off to Octogent" className="op-dialog--wide op-dialog--handoff">
    <HandoffSlot repoPath={repoPath} onClose={onClose} />
  </ModalFrame>
);
