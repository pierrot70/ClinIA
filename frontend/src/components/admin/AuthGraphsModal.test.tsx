import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthGraphsModal } from "./AuthGraphsModal";

const headerLabels = {
    controls: {
        close: "Fermer",
    },
    authLogsModal: {
        startDate: "Date debut",
        endDate: "Date fin",
    },
    authGraphsModal: {
        titlePrefix: "Auth Graphs",
        axisLabel: "Axe X: Date | Axe Y: Nombre de log",
        loading: "Chargement du graphique auth...",
        emptyRange: "Aucune donnee pour cette plage.",
        emptyAction: "Aucune donnee action pour ce graphique.",
        logCount: "Nombre de log",
    },
};

describe("AuthGraphsModal", () => {
    it("renders empty state for graph data", () => {
        render(
            <AuthGraphsModal
                isOpen
                title="Auth Graphs - Pie graph"
                startDate="2026-05-17"
                endDate="2026-05-17"
                loading={false}
                error={null}
                graphType="pie"
                graphPoints={[]}
                graphActions={[]}
                pieData={[]}
                graphActionColors={{}}
                headerLabels={headerLabels}
                renderLabel={(text) => text}
                histogramTooltip={<div>Histogram tooltip</div>}
                lineTooltip={<div>Line tooltip</div>}
                onClose={() => {}}
                onStartDateChange={() => {}}
                onEndDateChange={() => {}}
                onPieSliceClick={() => {}}
            />
        );

        expect(screen.getByText("Auth Graphs - Pie graph")).toBeInTheDocument();
        expect(screen.getByText("Aucune donnee pour cette plage.")).toBeInTheDocument();
    });
});
