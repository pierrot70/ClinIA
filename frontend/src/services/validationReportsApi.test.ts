import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadValidationReport } from "./validationReportsApi";

const authFetch = vi.hoisted(() => vi.fn());
vi.mock("./authService", () => ({ authFetch }));

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    authFetch.mockReset();
});

describe("validation report downloads", () => {
    it("downloads JSON then PDF for each run using its own URL, response and filename", async () => {
        vi.useFakeTimers();
        const createObjectURL = vi.fn();
        const revokeObjectURL = vi.fn();
        vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
        const downloads: { href: string; name: string }[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            expect(document.body.contains(this)).toBe(true);
            downloads.push({ href: this.href, name: this.download });
        });

        let index = 0;
        for (const runId of ["newer-run", "older-run"]) {
            for (const format of ["bundle", "pdf"] as const) {
                index++;
                const blob = new Blob([`${runId}:${format}`]);
                authFetch.mockResolvedValueOnce({ ok: true, blob: vi.fn().mockResolvedValue(blob) });
                const url = `blob:report-${index}`;
                createObjectURL.mockReturnValueOnce(url);
                await downloadValidationReport(runId, format);
                expect(authFetch).toHaveBeenNthCalledWith(index, `/api/validation-reports/${runId}/${format}`);
                expect(createObjectURL).toHaveBeenNthCalledWith(index, blob);
                expect(downloads[index - 1]).toEqual({ href: url, name: `clinia-validation-${runId}.${format === "pdf" ? "pdf" : "json"}` });
                expect(document.querySelector("a[download]")).toBeNull();
            }
        }
        expect(revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(revokeObjectURL.mock.calls).toEqual(downloads.map(({ href }) => [href]));
    });
});
