import { describe, expect, it } from "vitest";
import { evaluateIndexAuditOutcome } from "./migrationIndexAuditProtocol.js";

describe("migration index audit protocol", () => {
    const limits = { durationMs: 42, maxDurationMs: 5000 };

    it("allows a corrective migration to start when the pre-audit finds index drift", () => {
        expect(
            evaluateIndexAuditOutcome({
                ...limits,
                strict: false,
                result: { errors: 1, extras: 1 },
            })
        ).toEqual({ status: "WARNING", reason: null, hasDrift: true });
    });

    it("blocks completion when index drift remains after a migration", () => {
        expect(
            evaluateIndexAuditOutcome({
                ...limits,
                strict: true,
                result: { errors: 0, extras: 1 },
            })
        ).toEqual({
            status: "ERROR",
            reason: "drift_remaining",
            hasDrift: true,
        });
    });

    it("warns when an audit is slow without blocking the migration", () => {
        expect(
            evaluateIndexAuditOutcome({
                durationMs: 5001,
                maxDurationMs: 5000,
                strict: false,
                result: { errors: 0, extras: 0 },
            })
        ).toEqual({
            status: "WARNING",
            reason: "duration_exceeded",
            hasDrift: false,
        });
    });
});
