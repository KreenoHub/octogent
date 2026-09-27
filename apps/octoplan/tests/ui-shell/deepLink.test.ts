import { describe, expect, it } from "vitest";
import { initialOverlay } from "../../web/src/components/CockpitLayout";

describe("?focus=1 deep link", () => {
  it("opens focus mode only when asked", () => {
    expect(initialOverlay("?focus=1")).toBe("focus");
    expect(initialOverlay("?focus=0")).toBe("none");
    expect(initialOverlay("")).toBe("none");
    expect(initialOverlay("?other=1&focus=1")).toBe("focus");
  });
});
