// Contract stub (D35): the integrations tentacle replaces this with the 4-step handoff wizard (D44).
import type { HandoffSlotProps } from "../../components/slots";

export const HandoffWizard = ({ onClose }: HandoffSlotProps) => (
  <div className="op-handoff" data-testid="handoff-wizard">
    <button type="button" onClick={onClose}>
      Close
    </button>
  </div>
);
