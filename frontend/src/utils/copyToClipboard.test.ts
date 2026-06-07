import { afterEach, describe, expect, it, vi } from "vitest";

import { copyToClipboard } from "./copyToClipboard";

describe("copyToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await copyToClipboard('{"age":55}');

    expect(writeText).toHaveBeenCalledWith('{"age":55}');
  });

  it("falls back to execCommand when clipboard access is rejected", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await copyToClipboard('{"age":55}');

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
  });
});
