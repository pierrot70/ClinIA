import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SecurityIncidentsModal } from "./SecurityIncidentsModal";

const labels = {
    securityIncidentsModal: {
        title: "Incidents de securite",
        description: "Suivi des incidents detectes.",
        refresh: "Rafraichir",
        close: "Fermer",
        filtersAcknowledged: "Acknowledgement",
        all: "Toutes",
        notAcknowledgedOnly: "Non acknowledges seulement",
        acknowledgedOnly: "Acknowledges seulement",
        type: "Type",
        loading: "Chargement...",
        empty: "Aucun incident.",
        detectedAt: "Detecte le",
        reason: "Raison",
        requestPath: "Route",
        context: "Contexte",
        action: "Action",
        acknowledgedAtPrefix: "Acknowledge le",
        impactedAccount: "Compte impacte",
        acknowledged: "Acknowledge",
        acknowledging: "Acknowledgement...",
        acknowledge: "Acknowledge",
        explain: "Explanation",
        hideExplanation: "Hide",
        explanationTitle: "Understand this incident",
        explanationWhatHappened: "Detected:",
        explanationWhatWasBlocked: "Blocked:",
        explanationNextStep: "Next step:",
        explanationAcknowledgement: "Acknowledgement does not restore content.",
        nonSecurePreCloudWhatHappened: "A patient identifier was detected.",
        nonSecurePreCloudWhatWasBlocked: "The cloud request was blocked.",
        nonSecurePreCloudNextStep: "Remove identifying details.",
        cspViolationWhatHappened: "A browser resource was blocked.",
        cspViolationWhatWasBlocked: "The browser blocked it.",
        cspViolationNextStep: "Review the directive.",
        pagePrefix: "Page",
        pageSeparator: "/",
        resultSuffix: "resultats",
        first: "<<",
        previousSymbol: "<",
        nextSymbol: ">",
        last: ">>",
    },
};

describe("SecurityIncidentsModal", () => {
    it("renders empty state and forwards refresh action", () => {
        const onRefresh = vi.fn();

        render(
            <SecurityIncidentsModal
                isOpen
                items={[]}
                loading={false}
                error={null}
                ackingId=""
                acknowledgedFilter="false"
                typeFilter=""
                pagination={{ page: 1, limit: 10, total: 0, totalPages: 1 }}
                headerLabels={labels}
                onClose={() => {}}
                onRefresh={onRefresh}
                onAcknowledgedFilterChange={() => {}}
                onTypeFilterChange={() => {}}
                onAcknowledge={() => {}}
                onLoadPage={() => {}}
            />
        );

        expect(screen.getByText("Incidents de securite")).toBeInTheDocument();
        expect(screen.getByText("Aucun incident.")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Rafraichir" }));
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("explains a pre-cloud PHI incident without displaying its detected value", () => {
        render(
            <SecurityIncidentsModal
                isOpen
                items={[
                    {
                        id: "incident-1",
                        type: "NON_SECURE_CONTENT",
                        phase: "pre_cloud",
                        reason: "Identifier detected.",
                        requestPath: "/api/ai/analyze",
                        transport: "openai_chat_completions",
                        matches: [],
                        context: {},
                        detectedAt: "2026-07-18T12:00:00.000Z",
                        acknowledged: false,
                        acknowledgmentAction: "",
                        acknowledgedAt: null,
                        acknowledgmentContext: {},
                        createdAt: "2026-07-18T12:00:00.000Z",
                        updatedAt: "2026-07-18T12:00:00.000Z",
                    },
                ]}
                loading={false}
                error={null}
                ackingId=""
                acknowledgedFilter="false"
                typeFilter=""
                pagination={{ page: 1, limit: 10, total: 1, totalPages: 1 }}
                headerLabels={labels}
                onClose={() => {}}
                onRefresh={() => {}}
                onAcknowledgedFilterChange={() => {}}
                onTypeFilterChange={() => {}}
                onAcknowledge={() => {}}
                onLoadPage={() => {}}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "Explanation" }));

        expect(screen.getByText("Understand this incident")).toBeInTheDocument();
        expect(screen.getByText("A patient identifier was detected.")).toBeInTheDocument();
        expect(screen.getByText("The cloud request was blocked.")).toBeInTheDocument();
        expect(screen.getByText("Remove identifying details.")).toBeInTheDocument();
    });
});
