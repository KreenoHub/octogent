export type Overlay = "none" | "focus" | "new-session" | "idea" | "branch" | "graph" | "export";

/** `?focus=1` opens focus mode on load: a bookmarkable "just answer questions" view. */
export const initialOverlay = (search: string): Overlay =>
  new URLSearchParams(search).get("focus") === "1" ? "focus" : "none";
