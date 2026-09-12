import { afterEach, describe, expect, it, vi } from "vitest";
import { withPasswordVerificationDelay } from "../passwordVerificationDelay.js";

afterEach(() => vi.useRealTimers());

describe("password verification delays", () => {
    it.each(["success", "failure", "sync-error", "mfa"])("waits before verification and before returning %s", async outcome => {
        vi.useFakeTimers();
        const value = outcome === "mfa" ? { mfaRequired: true } : { success: true };
        const error = new Error("synthetic failure");
        const operation = vi.fn(() => {
            if (outcome === "sync-error") throw error;
            return outcome === "failure" ? Promise.reject(error) : Promise.resolve(value);
        });
        const settled = vi.fn();
        const pending = withPasswordVerificationDelay(operation).then(
            result => { settled(); return result; },
            reason => { settled(); return reason; },
        );
        await vi.advanceTimersByTimeAsync(999);
        expect(operation).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(operation).toHaveBeenCalledTimes(1);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(999);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(await pending).toBe(["failure", "sync-error"].includes(outcome) ? error : value);
        expect(settled).toHaveBeenCalledTimes(1);
    });

    it("waits a full second after a slow operation finishes", async () => {
        vi.useFakeTimers();
        let finish;
        const operation = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        const settled = vi.fn();
        const pending = withPasswordVerificationDelay(operation).then(settled);
        await vi.advanceTimersByTimeAsync(4000);
        expect(operation).toHaveBeenCalledTimes(1);
        expect(settled).not.toHaveBeenCalled();
        finish("done");
        await vi.advanceTimersByTimeAsync(999);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await pending;
        expect(settled).toHaveBeenCalledWith("done");
    });
});
