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
});
