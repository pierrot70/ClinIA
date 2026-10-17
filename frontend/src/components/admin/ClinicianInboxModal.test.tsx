import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../../i18n/homeStrings";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClinicianInboxModal } from "./ClinicianInboxModal";

const labels = {
    title: "Boite de reception clinicien",
    description: "Suivi des nouveaux commentaires.",
    refresh: "Rafraichir",
    close: "Fermer",
    filtersActor: "Acteur",
    filtersCategory: "Categorie",
    filtersReplied: "Repondu",
    filtersStartDate: "Date debut",
    filtersEndDate: "Date fin",
    all: "Tous",
    allFeminine: "Toutes",
    repliedYes: "Oui",
    repliedNo: "Non",
    loading: "Chargement...",
    empty: "Aucun commentaire.",
    createdAt: "Cree le",
    actor: "Acteur",
    category: "Categorie",
    replied: "Repondu",
    comment: "Commentaire",
    action: "Action",
    reply: "Repondre",
    replyPlaceholder: "Votre reponse",
    replying: "Envoi...",
    replySubmit: "Envoyer",
    replyCancel: "Annuler",
    replySaved: "Reponse enregistree.",
    pagePrefix: "Page",
    pageSeparator: "/",
    resultSuffix: "resultats",
    first: "<<",
    previousSymbol: "<",
    nextSymbol: ">",
    last: ">>",
};

describe("ClinicianInboxModal", () => {
    it("renders empty state and forwards refresh action", () => {
        const onRefresh = vi.fn();
        const onClose = vi.fn();

        render(
            <ClinicianInboxModal
                isOpen
                labels={labels}
                headerLabels={{ controls: { search: "Rechercher" } }}
                items={[]}
                actors={[]}
                loading={false}
                error={null}
                actorFilter=""
                categoryFilter=""
                repliedFilter=""
                startDate="2026-05-17"
                endDate="2026-05-17"
                pagination={{ page: 1, limit: 10, total: 0, totalPages: 1 }}
                replyTargetId=""
                replyMessage=""
                replying={false}
                replySuccess=""
                onClose={onClose}
                onRefresh={onRefresh}
                onActorFilterChange={() => {}}
                onCategoryFilterChange={() => {}}
                onRepliedFilterChange={() => {}}
                onStartDateChange={() => {}}
                onEndDateChange={() => {}}
                onSearch={() => {}}
                onToggleReply={() => {}}
                onReplyMessageChange={() => {}}
                onSubmitReply={() => {}}
                onCancelReply={() => {}}
                onLoadPage={() => {}}
            />
        );

        expect(screen.getByText("Boite de reception clinicien")).toBeInTheDocument();
        expect(screen.getByText("Aucun commentaire.")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Rafraichir" }));
        expect(onRefresh).toHaveBeenCalledTimes(1);

        expect(screen.getByTestId("clinician-inbox-sticky-header")).toHaveClass(
            "sticky",
            "top-0"
        );
        fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

const categoryExpectations = [
    ["fr-CA", ["Bug", "Suggestion", "Urgence", "Incompréhension"]],
    ["en-CA", ["Bug", "Suggestion", "Urgent", "Confusion"]],
    ["es", ["Error", "Sugerencia", "Urgencia", "Duda"]],
    ["ko-KR", ["오류", "제안", "긴급", "문의"]],
    ["vi", ["Lỗi", "Đề xuất", "Khẩn cấp", "Thắc mắc"]],
    ["no-NO", ["Feil", "Forslag", "Haster", "Spørsmål"]],
    ["ja", ["不具合", "提案", "緊急", "不明点"]],
    ["zh", ["故障", "建议", "紧急", "疑问"]],
    ["he", ["תקלה", "הצעה", "דחוף", "שאלה"]],
] as const;
const categoryCodes = ["BUG", "SUGGESTION", "URGENT", "INCOMPREHENSION"] as const;
const syntheticItems = categoryCodes.map((category, index) => ({
    id: `synthetic-${index}`, actorUserId: null, actorUsername: "Synthetic author", actorRole: "MEDECIN",
    category, comment: `Original comment ${index}`, redactionCount: 0, redactionTypes: [],
    createdAt: "2026-10-17T13:00:00.000Z", replies: [{ id: `reply-${index}`, responderUserId: "synthetic-admin",
        responderUsername: "Synthetic admin", responderRole: "ADMIN", message: `Original reply ${index}`,
        createdAt: "2026-10-17T13:05:00.000Z" }],
}));

function localizedInbox(locale: string, onCategoryFilterChange = vi.fn(), categoryFilter = "") {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <ClinicianInboxModal isOpen labels={labels} headerLabels={{ controls: { search: "Rechercher" } }}
            items={syntheticItems} actors={[]} loading={false} error={null} actorFilter=""
            categoryFilter={categoryFilter} repliedFilter="" startDate="" endDate=""
            pagination={{ page: 1, limit: 10, total: 4, totalPages: 1 }} replyTargetId="" replyMessage=""
            replying={false} replySuccess="" onClose={vi.fn()} onRefresh={vi.fn()} onActorFilterChange={vi.fn()}
            onCategoryFilterChange={onCategoryFilterChange} onRepliedFilterChange={vi.fn()} onStartDateChange={vi.fn()}
            onEndDateChange={vi.fn()} onSearch={vi.fn()} onToggleReply={vi.fn()} onReplyMessageChange={vi.fn()}
            onSubmitReply={vi.fn()} onCancelReply={vi.fn()} onLoadPage={vi.fn()} />
    </HomeI18nContext.Provider>;
}

afterEach(cleanup);

describe("ClinicianInboxModal category translations", () => {
    it.each(categoryExpectations)("translates filter options and table categories in %s, preserving API values and user text", (locale, expected) => {
        const onChange = vi.fn();
        render(localizedInbox(locale, onChange));
        for (const [index, label] of expected.entries()) {
            const option = screen.getByRole("option", { name: label });
            expect(option).toHaveValue(categoryCodes[index]);
            expect(screen.getByRole("cell", { name: label })).toBeVisible();
            fireEvent.change(option.closest("select")!, { target: { value: categoryCodes[index] } });
            expect(onChange).toHaveBeenLastCalledWith(categoryCodes[index]);
            expect(screen.getByText(`Original comment ${index}`)).toBeVisible();
            expect(screen.getByText(`Original reply ${index}`)).toBeVisible();
        }
    });

    it("retranslates an open inbox without changing the selected category or the original comments", () => {
        const onChange = vi.fn();
        const { rerender } = render(localizedInbox("en-CA", onChange, "URGENT"));
        const select = screen.getByRole("option", { name: "Urgent" }).closest("select")!;
        expect(select).toHaveValue("URGENT");
        rerender(localizedInbox("ja", onChange, "URGENT"));
        expect(select).toHaveValue("URGENT");
        expect(screen.getByRole("option", { name: "緊急" })).toHaveProperty("selected", true);
        expect(screen.getByRole("cell", { name: "緊急" })).toBeVisible();
        expect(screen.queryByRole("option", { name: "Urgent" })).not.toBeInTheDocument();
        expect(screen.getByText("Original comment 2")).toBeVisible();
        expect(screen.getByText("Original reply 2")).toBeVisible();
        expect(onChange).not.toHaveBeenCalled();
        expect(syntheticItems[2].category).toBe("URGENT");
    });
});
