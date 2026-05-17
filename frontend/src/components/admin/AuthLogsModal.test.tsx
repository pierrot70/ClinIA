import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthLogsModal } from "./AuthLogsModal";

const headerLabels = {
    controls: {
        close: "Fermer",
        search: "Chercher",
        reset: "Reset",
    },
    authLogsModal: {
        title: "Auth Log",
        queryTimePrefix: "Temps requete:",
        startDate: "Date debut",
        endDate: "Date fin",
        action: "Action",
        passwordEventsOnly: "Evenements mot de passe seulement",
        loading: "Chargement",
        empty: "Aucun resultat.",
        tableDate: "Date",
        tableAction: "Action",
        tableResult: "Resultat",
        tableUser: "Usager",
        tableTargetUser: "Compte touche",
        tableRole: "Role",
        tableIp: "IP",
        tableReason: "Raison",
        page: "Page",
        results: "resultats",
    },
};

describe("AuthLogsModal", () => {
    it("renders password event details and triggers actions", () => {
        const onClose = vi.fn();
        const onStartDateChange = vi.fn();
        const onEndDateChange = vi.fn();
        const onActionChange = vi.fn();
        const onPasswordEventsOnlyChange = vi.fn();
        const onSearch = vi.fn();
        const onReset = vi.fn();
        const onLoadPage = vi.fn();

        render(
            <AuthLogsModal
                isOpen
                isSuperAdmin
                queryDurationMs={42}
                startDate="2026-05-17"
                endDate="2026-05-17"
                action=""
                passwordEventsOnly
                options={[{ value: "", label: "Toutes" }]}
                loading={false}
                error={null}
                logs={[
                    {
                        id: "1",
                        action: "USER_MANAGEMENT",
                        outcome: "SUCCESS",
                        userId: "u1",
                        usernameMasked: "su***",
                        actorUsername: "superadmin",
                        targetUsername: "pierrot.lasante",
                        role: "SUPERADMIN",
                        ip: "127.0.0.1",
                        reason: "RESET_PASSWORD:1",
                        timestamp: "2026-05-17T10:00:00.000Z",
                    },
                ]}
                pagination={{ page: 1, limit: 10, total: 1, totalPages: 1 }}
                headerLabels={headerLabels}
                renderLabel={(text) => text}
                formatTimestamp={(value) => value}
                onClose={onClose}
                onStartDateChange={onStartDateChange}
                onEndDateChange={onEndDateChange}
                onActionChange={onActionChange}
                onPasswordEventsOnlyChange={onPasswordEventsOnlyChange}
                onSearch={onSearch}
                onReset={onReset}
                onLoadPage={onLoadPage}
            />
        );

        expect(screen.getByText("Auth Log")).toBeInTheDocument();
        expect(screen.getByText("superadmin")).toBeInTheDocument();
        expect(screen.getByText("pierrot.lasante")).toBeInTheDocument();
        expect(screen.getByText("RESET_PASSWORD:1")).toBeInTheDocument();

        fireEvent.click(screen.getByText("Chercher"));
        fireEvent.click(screen.getByText("Reset"));
        fireEvent.click(screen.getByText("Fermer"));
        fireEvent.click(screen.getByRole("checkbox"));

        expect(onSearch).toHaveBeenCalledTimes(1);
        expect(onReset).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onPasswordEventsOnlyChange).toHaveBeenCalledWith(false);
    });
});
