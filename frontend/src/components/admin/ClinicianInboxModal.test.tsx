import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
                onClose={() => {}}
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
    });
});
