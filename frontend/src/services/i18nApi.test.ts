import { describe, expect, it, vi } from "vitest";

import { translateHomeStrings } from "./i18nApi";

describe("translateHomeStrings", () => {
  it("uses the local language bundle without a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await translateHomeStrings("en");

    expect(result.resolvedLang).toBe("en");
    expect(result.strings.home.title).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
