import { describe, expect, it } from "vitest";
import {
    minimizeAcknowledgmentContext,
    minimizeOpenAIRequestContext,
    minimizePatientAuditContext,
    minimizeSecurityIncidentContext,
    minimizeSecurityIncidentMatches,
} from "../auditDataMinimization.js";

describe("audit data minimization", () => {
    it("keeps only flags and counts in patient audit context", () => {
        expect(minimizePatientAuditContext({
            secureRequest: {
                objective: "Treat Patient Canary",
                clinicalScope: "Oncology",
                selectedDocumentIds: ["document-123", "document-456"],
            },
            clinicalNoteVersion: { changeType: "UPDATE", versionId: "version-123" },
        })).toEqual({
            secureRequest: {
                objectiveProvided: true,
                clinicalScopeProvided: true,
                selectedDocumentCount: 2,
            },
            clinicalNoteVersion: { changeType: "UPDATE" },
        });
    });

    it("allowlists OpenAI request and security incident metadata", () => {
        expect(minimizeOpenAIRequestContext({
            fingerprint: "fp-1",
            symptomCount: 2,
            arbitraryClinicalText: "CANARY-PHI",
            detectedIdentifierTypes: ["email", "unknown"],
        })).toEqual({
            fingerprint: "fp-1",
            symptomCount: 2,
            detectedIdentifierTypes: ["email"],
        });
        expect(minimizeSecurityIncidentMatches([
            { type: "email", path: "payload.diagnosis", sample: "ca***ry" },
        ])).toEqual([{ type: "email", path: "payload.diagnosis" }]);
        expect(minimizeSecurityIncidentContext("MASS_DOWNLOAD_ATTEMPT", {
            userId: "507f1f77bcf86cd799439011",
            username: "physician@example.test",
            ip: "127.0.0.1",
            totalCost: 250,
        })).toEqual({ userId: "507f1f77bcf86cd799439011", totalCost: 250 });
        expect(minimizeAcknowledgmentContext({
            route: "/clinical",
            note: "CANARY-PHI",
        })).toEqual({ route: "/clinical" });
    });
});
