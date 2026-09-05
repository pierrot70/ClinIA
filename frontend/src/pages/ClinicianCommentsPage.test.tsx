import React from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { commentsPageFrench, commentsPageTranslations } from "../i18n/commentsPageLabels";
import { ClinicianCommentsPage } from "./ClinicianCommentsPage";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), reply: vi.fn(), translate: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { role: "MEDECIN" }, isAuthenticated: true, status: "authenticated" }) }));
vi.mock("../services/clinicianCommentsApi", () => ({ listClinicianComments: api.list, createClinicianComment: api.create, replyToClinicianComment: api.reply }));
vi.mock("../services/translationApi", () => ({ translateText: api.translate }));

function Page({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <ClinicianCommentsPage />
    </HomeI18nContext.Provider>;
}

describe("clinician comments language policy", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.list.mockResolvedValue({ ok: true, data: { items: [{
            id: "test-comment", actorUsername: "demo", actorRole: "MEDECIN", category: "BUG",
            comment: "The schedule does not load.", createdAt: "2026-09-01T12:00:00Z",
            redactionCount: 0, replies: [],
        }] } });
        api.create.mockResolvedValue({ ok: true, data: { redactionCount: 0, trackingCode: "DEMO1234" } });
    });
    afterEach(cleanup);

    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])(
        "switches UI and English-writing guidance to %s without translating comments", async locale => {
            const expected = commentsPageTranslations[locale.split("-")[0]];
            expect(Object.keys(expected).sort()).toEqual(Object.keys(commentsPageFrench).sort());
            Object.values(expected).forEach(value => expect(typeof value === "string" && value.length > 0).toBe(true));
            const { rerender } = render(<Page locale="fr-CA" />);
            await screen.findByText("The schedule does not load.");
            const input = screen.getByRole("textbox", { name: commentsPageFrench.newCommentLabel });
            fireEvent.change(input, { target: { value: "The save button does not work." } });
            rerender(<Page locale={locale} />);
            await waitFor(() => expect(screen.getByRole("heading", { name: expected.pageTitle })).toBeInTheDocument());
            expect(screen.getByText(expected.englishOnlyHint)).toBeInTheDocument();
            expect(input).toHaveAccessibleDescription(expected.englishOnlyHint);
            expect(input).toHaveAttribute("lang", "en");
            expect(input).toHaveAttribute("placeholder", expected.commentPlaceholder);
            expect(input).toHaveValue("The save button does not work.");
            expect(screen.getByText("The schedule does not load.")).toBeInTheDocument();
            expect(screen.getByRole("option", { name: expected.bug })).toBeInTheDocument();
            fireEvent.click(screen.getByRole("button", { name: expected.submit }));
            await waitFor(() => expect(api.create).toHaveBeenCalledWith("The save button does not work.", "BUG", undefined, undefined));
            expect(api.translate).not.toHaveBeenCalled();
        }
    );
});
