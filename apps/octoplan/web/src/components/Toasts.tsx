import { useCallback, useEffect, useRef, useState } from "react";
import { useOctoplan } from "../app/useOctoplan";

export const TOAST_MS = 4000;

/** Server notices as toasts. Each one expires on its own timer; the store keeps the history. */
export const Toasts = () => {
  const { notices } = useOctoplan();
  // Notices already in the store when the cockpit mounts are history, not news.
  const [floor] = useState(() => notices.at(-1)?.id ?? 0);
  const [expired, setExpired] = useState<ReadonlySet<number>>(() => new Set());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const expire = useCallback((id: number) => setExpired((prev) => new Set(prev).add(id)), []);

  useEffect(() => {
    for (const notice of notices) {
      if (notice.id <= floor || timers.current.has(notice.id)) continue;
      timers.current.set(
        notice.id,
        setTimeout(() => expire(notice.id), TOAST_MS),
      );
    }
  }, [notices, floor, expire]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  const visible = notices.filter((n) => n.id > floor && !expired.has(n.id));
  return (
    <output className="op-toasts" aria-live="polite">
      {visible.map((notice) => (
        <div key={notice.id} className="op-toast" data-testid="toast">
          <span>{notice.message}</span>
          <button
            type="button"
            className="op-toast-close"
            aria-label="Dismiss"
            onClick={() => expire(notice.id)}
          >
            ×
          </button>
        </div>
      ))}
    </output>
  );
};
