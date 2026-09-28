import { createContext, useContext, useState } from "react";

/** R3: the E hotkey's stream-wide "expand everything" switch. */
export const ExpandAllContext = createContext(false);

export const useExpandAll = () => useContext(ExpandAllContext);

/**
 * Local collapsed state that starts folded when `collapsible`, and snaps to the stream-wide
 * switch every time E flips it (a local toggle wins until the next flip). A block that grows
 * from one line to many while streaming folds too.
 */
export const useExpandable = (collapsible: boolean) => {
  const expandAll = useExpandAll();
  const [collapsed, setCollapsed] = useState(collapsible && !expandAll);
  const [seen, setSeen] = useState({ expandAll, collapsible });
  if (seen.expandAll !== expandAll || seen.collapsible !== collapsible) {
    setSeen({ expandAll, collapsible });
    setCollapsed(collapsible && !expandAll);
  }
  return [collapsed, () => setCollapsed((value) => !value)] as const;
};
