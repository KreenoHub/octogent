import { type ReactNode, useId } from "react";

/** Backdrop + titled dialog shared by the small modals. Esc is the cockpit's global close. */
export const ModalFrame = ({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) => {
  const titleId = useId();
  return (
    <div className="op-backdrop">
      <dialog
        open
        className={className ? `op-dialog ${className}` : "op-dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="op-dialog-title">
          {title}
        </h2>
        {children}
      </dialog>
    </div>
  );
};
