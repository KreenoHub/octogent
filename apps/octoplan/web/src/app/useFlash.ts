import { useEffect, useRef, useState } from "react";

export const FLASH_MS = 1200;

/**
 * Names whose value just changed, for a short highlight (D19: plan-tool effects flash on the
 * board). A new `scope` (another repo) resets the baseline instead of flashing everything.
 */
export const useFlash = (values: Record<string, number>, scope: string | null): Set<string> => {
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
  const previous = useRef<{ scope: string | null; values: Record<string, number> }>({
    scope,
    values,
  });
  const signature = JSON.stringify(values);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` stands in for `values`
  useEffect(() => {
    const before = previous.current;
    previous.current = { scope, values };
    if (before.scope !== scope) return;
    const changed = Object.keys(values).filter((name) => before.values[name] !== values[name]);
    if (changed.length === 0) return;
    setFlashing(new Set(changed));
    const timer = setTimeout(() => setFlashing(new Set()), FLASH_MS);
    return () => clearTimeout(timer);
  }, [signature, scope]);

  return flashing;
};
