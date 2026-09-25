import { useEffect, useRef } from "react";

/** True when a key press should go to a text field rather than a global hotkey. */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = (element as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "submit", "reset"].includes(type);
  }
  return element.isContentEditable === true;
};

export type HotkeyMap = Partial<Record<string, () => void>>;

/**
 * Global single-key shortcuts (F, I, B, G, Escape). Letter keys are matched case-insensitively
 * and never fire while typing or with a modifier held; Escape always fires.
 */
export const useGlobalHotkeys = (map: HotkeyMap) => {
  const mapRef = useRef(map);
  mapRef.current = map;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const handler = mapRef.current[key];
      if (!handler) return;
      if (key !== "Escape") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTypingTarget(event.target)) return;
      }
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
};
