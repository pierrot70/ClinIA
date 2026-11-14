import { receptionReplanLabels } from "../i18n/receptionReplanLabels";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalkInArrivalPage } from "./WalkInArrivalPage";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { walkInRoutingLabels } from "../i18n/walkInRoutingLabels";
import { walkInGuideLabels } from "../i18n/walkInGuideLabels";
import { UI_LOCALES } from "../i18n/uiLocales";
import type { WalkInAvailability } from "../services/receptionApi";

const api = vi.hoisted(() => ({ lookup: vi.fn(), slots: vi.fn(), book: vi.fn(), enroll: vi.fn() }));
vi.mock("../services/receptionApi", () => ({ findReceptionPatientByRamq: api.lookup, fetchWalkInAvailability: api.slots, createWalkInBooking: api.book }));
vi.mock("../services/receptionWaitlistApi", () => ({ enrollWalkInWaitlist: api.enroll }));
vi.mock("../contexts/ReceptionClinicContext", () => ({ useReceptionClinic: () => ({ activeClinic: { _id: "origin", nom: "Origin synthetic clinic" }, isLoading: false }) }));
function Page({ locale = "en-CA" }: { locale?: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><WalkInArrivalPage /></HomeI18nContext.Provider>;
}
const found: WalkInAvailability = {
    presentation: "priority", selectedClinic: { _id: "nearby", nom: "Nearby synthetic clinic", distanceKm: 12.5 }, prioritySpecialty: "IPS",
    search: { status: "found", radiusKm: 100, toleranceKm: 10, maxDistanceKm: 110, distanceMode: "straight_line", examinedClinics: 2 },
    urgentologists: { limit: 20, day: "2030-01-01", allAtCapacity: true },
    today: [], future: [{ specialist: { _id: "ips", prenom: "Synthetic", nom: "Professional", specialty: "IPS" }, date: "2030-01-02", slots: ["09:00"], slotTypes: { "09:00": "walk_in" } }],
};
function empty(status: "exhausted" | "location_missing"): WalkInAvailability {
    return { presentation: "priority", search: { status, radiusKm: 100, toleranceKm: 10, maxDistanceKm: 110, distanceMode: "straight_line", examinedClinics: 3 }, today: [], future: [] };
}
beforeEach(() => {
    vi.clearAllMocks();
    api.lookup.mockResolvedValue({ data: null });
    api.slots.mockResolvedValue({ data: structuredClone(found) });
    api.book.mockResolvedValue({ data: { patient: { _id: "new-synthetic" }, appointment: { _id: "new-slot", date: "2030-01-02", time: "09:00" } } });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No direct provider or external request is allowed"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function searchNew() {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "SYNTHETIC-INSURANCE" } });
    fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
    await screen.findByRole("button", { name: "Refresh available appointments" });
}
describe("WalkIn priority destination and assisted GAP", () => {
    it.each([
        ["sms", "555-010-1243", "555-010-1244", "", { telephone: "555-010-1243", telephoneSms: "555-010-1244" }],
        ["phone", "555-010-1243", "", "", { telephone: "555-010-1243" }],
        ["email", "555-010-1243", "", "synthetic@example.invalid", { telephone: "555-010-1243", courriel: "synthetic@example.invalid" }],
    ])("saves the new dossier's contact details and waitlist consent for %s", async (channel, telephone, telephoneSms, courriel, expected) => {
        const extendedEmpty: WalkInAvailability = {
            ...empty("exhausted"), search: { status: "exhausted", radiusKm: 200, maxDistanceKm: 200, distanceMode: "straight_line", examinedClinics: 3 },
        };
        api.slots.mockResolvedValueOnce({ data: empty("exhausted") }).mockResolvedValueOnce({ data: extendedEmpty });
        api.enroll.mockResolvedValue({ data: { _id: "synthetic-entry" } });
        render(<Page />); await searchNew();
        expect(screen.queryByRole("button", { name: "Join the waitlist" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: walkInRoutingLabels("en-CA").extendSearch }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Join the waitlist" }));
        const save = screen.getByRole("button", { name: "Save enrollment" });
        expect(save).toBeDisabled();
        fireEvent.change(screen.getByRole("textbox", { name: "First name" }), { target: { value: "Synthetic" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Last name" }), { target: { value: "Patient" } });
        fireEvent.change(screen.getByLabelText("Preferred contact method"), { target: { value: channel } });
        fireEvent.change(screen.getByRole("textbox", { name: "Phone number" }), { target: { value: telephone } });
        const smsField = screen.getByRole("textbox", { name: "Number for SMS" });
        expect(smsField).toHaveProperty("required", channel === "sms");
        fireEvent.change(smsField, { target: { value: telephoneSms } });
        fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), { target: { value: courriel } });
        expect(api.enroll).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(save);
        expect(await screen.findByText("The patient was added to the waitlist.")).toBeVisible();
        expect(api.enroll).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            clinic: "origin", insuranceNumber: "SYNTHETIC-INSURANCE", channel, consent: true, prenom: "Synthetic", nom: "Patient", ...expected,
        }));
        expect(api.book).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("highlights an invalid optional SMS number without updating an existing dossier", async () => {
        const extendedEmpty: WalkInAvailability = {
            ...empty("exhausted"), search: { status: "exhausted", radiusKm: 200, maxDistanceKm: 200, distanceMode: "straight_line", examinedClinics: 3 },
        };
        api.lookup.mockResolvedValue({ data: { _id: "known", bookingProof: "synthetic-proof", prenom: "Fictional", nom: "Known", existingAppointments: [] } });
        api.slots.mockResolvedValueOnce({ data: empty("exhausted") }).mockResolvedValueOnce({ data: extendedEmpty });
        api.enroll.mockResolvedValue({ data: { _id: "synthetic-entry" } });
        render(<Page />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "SYNTHETIC-INSURANCE" } });
        fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
        fireEvent.click(await screen.findByRole("button", { name: /Select/ }));
        fireEvent.click(screen.getByRole("button", { name: "View available appointments" }));
        fireEvent.click(await screen.findByRole("button", { name: walkInRoutingLabels("en-CA").extendSearch }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Join the waitlist" }));
        fireEvent.change(screen.getByLabelText("Preferred contact method"), { target: { value: "phone" } });
        const phone = screen.getByRole("textbox", { name: "Phone number" });
        const sms = screen.getByRole("textbox", { name: "Number for SMS" });
        const email = screen.getByRole("textbox", { name: "Email address" });
        fireEvent.change(phone, { target: { value: "555-010-1243" } });
        fireEvent.change(sms, { target: { value: "123" } });
        fireEvent.change(email, { target: { value: "synthetic@example.invalid" } });
        fireEvent.click(screen.getByRole("checkbox"));
        const save = screen.getByRole("button", { name: "Save enrollment" });
        fireEvent.click(save);

        const message = "The SMS number is invalid. Enter a number with 7 to 15 digits.";
        expect(screen.getByText(message)).toBeVisible();
        expect(screen.getByText(message)).toHaveAttribute("role", "alert");
        expect(sms).toHaveFocus();
        expect(sms).toHaveAttribute("aria-invalid", "true");
        expect(sms).toHaveAccessibleDescription(message);
        expect(phone).toHaveValue("555-010-1243");
        expect(email).toHaveValue("synthetic@example.invalid");
        expect(api.enroll).not.toHaveBeenCalled();

        fireEvent.change(sms, { target: { value: "+1 (555) 010-1244" } });
        expect(screen.queryByText(message)).not.toBeInTheDocument();
        fireEvent.click(save);
        expect(await screen.findByText("The patient was added to the waitlist.")).toBeVisible();
        expect(api.enroll).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            patientId: "known", telephone: "555-010-1243", telephoneSms: "+1 (555) 010-1244", courriel: "synthetic@example.invalid",
        }));
    });

    it("shows the server-selected IPS destination and future appointments before the final booking confirmation", async () => {
        render(<Page />); await searchNew();
        const routing = walkInRoutingLabels("en-CA");
        expect(screen.getByText(routing.destination.replace("{name}", "Nearby synthetic clinic"))).toBeVisible();
        expect(screen.getByText(routing.distance.replace("{distance}", "12.5"))).toBeVisible();
        expect(screen.getByText(/Specialized nurse practitioner \(IPS\)/)).toBeVisible();
        expect(screen.queryByRole("button", { name: "Return tomorrow" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /09:00/ }));
        expect(screen.getByText(routing.destination.replace("{name}", "Nearby synthetic clinic"))).toBeVisible();
        expect(api.book).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Fictional" } });
        fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "WalkIn" } });
        fireEvent.click(screen.getByRole("button", { name: "Create patient and appointment" }));
        await screen.findByRole("button", { name: "Search for patient" });
        expect(api.book).toHaveBeenCalledTimes(1);
        expect(api.book).toHaveBeenCalledWith(expect.objectContaining({ clinic: "nearby", originClinic: "origin", specialist: "ips", date: "2030-01-02", time: "09:00", slotType: "walk_in" }));
        expect(fetch).not.toHaveBeenCalled();
    });
    it("sends the original patient lookup proof when searching and keeps the origin on cross-clinic confirmation", async () => {
        api.lookup.mockResolvedValue({ data: { _id: "known", bookingProof: "synthetic-lookup-proof", prenom: "Fictional", nom: "Known", existingAppointments: [] } });
        render(<Page />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "SYNTHETIC-INSURANCE" } });
        fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
        fireEvent.click(await screen.findByRole("button", { name: /Select/ }));
        fireEvent.click(screen.getByRole("button", { name: "View available appointments" }));
        fireEvent.click(await screen.findByRole("button", { name: /09:00/ }));
        expect(api.slots).toHaveBeenCalledWith("origin", "known", undefined, "synthetic-lookup-proof");
        expect(api.book).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Create appointment" }));
        await screen.findByRole("button", { name: "Search for patient" });
        expect(api.book).toHaveBeenCalledWith(expect.objectContaining({ clinic: "nearby", originClinic: "origin", patientId: "known", bookingProof: "synthetic-lookup-proof" }));
    });
    it("preserves a located result while warning that proximity order excludes unlocated clinics", async () => {
        api.slots.mockResolvedValue({ data: { ...found, search: { ...found.search, hasUnlocatedClinics: true } } });
        render(<Page />); await searchNew();
        expect(screen.getByText(walkInRoutingLabels("en-CA").unlocatedWarning)).toBeVisible();
        expect(screen.getByRole("button", { name: /09:00/ })).toBeEnabled();
        expect(screen.queryByText(walkInRoutingLabels("en-CA").exhaustedTitle.replace("{maxDistance}", "110"))).not.toBeInTheDocument();
    });
    it.each(UI_LOCALES)("offers expansion before GAP and shows the notice on decline in %s", async locale => {
        api.slots.mockResolvedValue({ data: empty("exhausted") });
        const { rerender } = render(<Page />); await searchNew(); rerender(<Page locale={locale} />);
        const routing = walkInRoutingLabels(locale);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: routing.extendSearch })).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: routing.declineExtension }));
        const dialog = await screen.findByRole("dialog", { name: routing.exhaustedTitle.replace("{maxDistance}", "110") });
        expect(dialog).toHaveTextContent(routing.gapNotice);
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: routing.gapAcknowledge }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        rerender(<Page locale="en-CA" />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Refresh available appointments" }));
        expect(await screen.findByRole("button", { name: walkInRoutingLabels("en-CA").extendSearch })).toBeVisible();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(api.book).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
    it("sends explicit agreement when searching and booking a 110.1 km offer", async () => {
        const extended: WalkInAvailability = {
            ...found, selectedClinic: { ...found.selectedClinic!, distanceKm: 110.1 },
            search: { radiusKm: 200, maxDistanceKm: 200, status: "found", distanceMode: "straight_line", examinedClinics: 2 },
        };
        api.slots.mockResolvedValueOnce({ data: empty("exhausted") }).mockResolvedValueOnce({ data: extended });
        render(<Page />); await searchNew();
        const routing = walkInRoutingLabels("en-CA");
        expect(screen.queryByRole("button", { name: /09:00/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: routing.extendSearch }));
        fireEvent.click(await screen.findByRole("button", { name: /09:00/ }));
        expect(api.slots).toHaveBeenLastCalledWith("origin", undefined, undefined, undefined, false, true);
        expect(screen.getByText(routing.distance.replace("{distance}", "110.1"))).toBeVisible();
        fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Fictional" } });
        fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "WalkIn" } });
        fireEvent.click(screen.getByRole("button", { name: "Create patient and appointment" }));
        await screen.findByRole("button", { name: "Search for patient" });
        expect(api.book).toHaveBeenCalledWith(expect.objectContaining({ extendedSearchAccepted: true, originClinic: "origin", clinic: "nearby" }));
    });
    it("shows GAP only after an agreed extended search returns no offer", async () => {
        const extended: WalkInAvailability = {
            ...empty("exhausted"),
            search: { radiusKm: 200, maxDistanceKm: 200, status: "exhausted", distanceMode: "straight_line", examinedClinics: 3 },
        };
        api.slots.mockResolvedValueOnce({ data: empty("exhausted") }).mockResolvedValueOnce({ data: extended });
        render(<Page />); await searchNew();
        const routing = walkInRoutingLabels("en-CA");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: routing.extendSearch }));
        expect(await screen.findByRole("dialog", { name: routing.exhaustedTitle.replace("{maxDistance}", "200") })).toBeVisible();
        expect(api.book).not.toHaveBeenCalled();
    });
    it("does not claim no availability or offer GAP when clinic coordinates are incomplete", async () => {
        api.slots.mockResolvedValue({ data: empty("location_missing") });
        render(<Page />); await searchNew();
        const routing = walkInRoutingLabels("en-CA");
        expect(screen.getByText(routing.locationMissingTitle)).toBeVisible();
        expect(screen.queryByText(routing.exhaustedTitle.replace("{maxDistance}", "110"))).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(api.book).not.toHaveBeenCalled();
    });
    it("clears a stale routed slot and requires a new availability search instead of retrying the write", async () => {
        api.book.mockResolvedValue({ error: { code: "NO_AVAILABILITY", message: "Private conflict detail" } });
        api.lookup.mockResolvedValue({ data: { _id: "known", bookingProof: "synthetic-proof", prenom: "Fictional", nom: "Known", existingAppointments: [] } });
        render(<Page />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "SYNTHETIC-INSURANCE" } });
        fireEvent.click(screen.getByRole("button", { name: "Search for patient" }));
        fireEvent.click(await screen.findByRole("button", { name: /Select/ }));
        fireEvent.click(screen.getByRole("button", { name: "View available appointments" }));
        fireEvent.click(await screen.findByRole("button", { name: /09:00/ }));
        fireEvent.click(screen.getByRole("button", { name: "Create appointment" }));
        expect(await screen.findByText(walkInRoutingLabels("en-CA").availabilityChanged)).toBeVisible();
        expect(screen.queryByRole("button", { name: "Create appointment" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /09:00/ })).not.toBeInTheDocument();
        expect(screen.queryByText("Private conflict detail")).not.toBeInTheDocument();
        expect(api.book).toHaveBeenCalledTimes(1);
        expect(api.slots).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", { name: "View available appointments" }));
        await screen.findByRole("button", { name: /09:00/ });
        expect(api.slots).toHaveBeenCalledTimes(2);
        expect(api.book).toHaveBeenCalledTimes(1);
    });
    it("does not make a malformed or over-radius destination bookable", async () => {
        api.slots.mockResolvedValue({ data: { ...found, selectedClinic: { ...found.selectedClinic, distanceKm: 110.1 } } });
        render(<Page />); await searchNew();
        const routing = walkInRoutingLabels("en-CA");
        expect(screen.getByText(routing.locationMissingTitle)).toBeVisible();
        expect(screen.queryByRole("button", { name: /09:00/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    it("keeps the guide focused on assistance options without automatically opening GAP or booking", async () => {
        api.slots.mockResolvedValue({ data: empty("exhausted") });
        render(<Page />); await searchNew();
        const routing = walkInRoutingLabels("en-CA");
        fireEvent.click(screen.getByRole("button", { name: walkInGuideLabels("en-CA").start }));
        expect(screen.getByText(routing.guideUnavailableTitle)).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: routing.guideUnavailableAction }));
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(api.book).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
    it.each(["primary", "earlier"])("compares a local appointment in 30 days with tomorrow and books only the explicit %s choice", async choice => {
        const primary = { ...structuredClone(found), selectedClinic: { _id: "origin", nom: "Origin synthetic clinic", distanceKm: 0 }, future: [{ ...found.future[0], date: "2030-02-01", slots: ["14:00"] }] };
        const compared = { ...primary, earlierAlternatives: [{ ...found.future[0], clinic: { _id: "tomorrow-clinic", nom: "Tomorrow synthetic clinic", distanceKm: 42 }, prioritySpecialty: "Medecin de famille" as const }] };
        api.slots.mockResolvedValueOnce({ data: primary }).mockResolvedValue({ data: compared });
        render(<Page />); await searchNew();
        const routing=walkInRoutingLabels("en-CA");
        expect(screen.queryByText("Tomorrow synthetic clinic")).not.toBeInTheDocument();
        expect(api.slots).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", { name: routing.compareEarlier }));
        await screen.findByText(routing.earlierOffers.replace("{maxDistance}", "110"));
        expect(api.slots).toHaveBeenLastCalledWith("origin", undefined, undefined, undefined, true);
        expect(screen.getByRole("button", { name: /14:00/ })).toBeEnabled();
        expect(screen.getByRole("button", { name: /09:00/ })).toBeEnabled();
        expect(screen.getByText(routing.distance.replace("{distance}", "42"))).toBeVisible();
        expect(api.book).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: choice === "earlier" ? /09:00/ : /14:00/ }));
        expect(screen.getByText(routing.destination.replace("{name}", choice === "earlier" ? "Tomorrow synthetic clinic" : "Origin synthetic clinic"))).toBeVisible();
        fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Fictional" } });
        fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "WalkIn" } });
        fireEvent.click(screen.getByRole("button", { name: "Create patient and appointment" }));
        await screen.findByRole("button", { name: "Search for patient" });
        expect(api.book).toHaveBeenCalledTimes(1);
        expect(api.book).toHaveBeenCalledWith(expect.objectContaining({ clinic: choice === "earlier" ? "tomorrow-clinic" : "origin", originClinic: "origin", selectionMode: choice === "earlier" ? "earlier" : "priority", date: choice === "earlier" ? "2030-01-02" : "2030-02-01" }));
        expect(fetch).not.toHaveBeenCalled();
    });
    it("keeps the primary proposal and never shows GAP when no earlier proposal is found", async () => {
        api.slots.mockResolvedValueOnce({ data: found }).mockResolvedValue({ data: { ...found, earlierAlternatives: [] } });
        render(<Page />); await searchNew();
        const routing=walkInRoutingLabels("en-CA");
        fireEvent.click(screen.getByRole("button", { name: routing.compareEarlier }));
        expect(await screen.findByText(routing.noEarlier)).toBeVisible();
        expect(screen.getByRole("button", { name: /09:00/ })).toBeEnabled();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(api.book).not.toHaveBeenCalled();
    });
    it("never offers an alternative farther than the explicit 110 km maximum", async () => {
        api.slots.mockResolvedValue({ data: { ...found, earlierAlternatives: [{ ...found.future[0], clinic: { _id: "far", nom: "Too far synthetic clinic", distanceKm: 110.01 }, prioritySpecialty: "IPS" }] } });
        render(<Page />); await searchNew();
        expect(screen.queryByText(/Too far synthetic clinic/)).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /09:00/ })).toHaveLength(1);
    });

    it.each([105.6, 110])("offers a destination at %s km only with complete, coherent tolerance metadata", async distanceKm => {
        api.slots.mockResolvedValue({ data: { ...found, selectedClinic: { ...found.selectedClinic, distanceKm } } });
        render(<Page />); await searchNew();
        const routing=walkInRoutingLabels("en-CA");
        expect(screen.getByText(routing.searchLimit.replace("{radius}","100").replace("{tolerance}","10").replace("{maxDistance}","110"))).toBeVisible();
        expect(screen.getByRole("button", { name: /09:00/ })).toBeEnabled();
        fireEvent.click(screen.getByRole("button", { name: /09:00/ }));
        expect(screen.getByText(routing.distance.replace("{distance}",String(distanceKm)))).toBeVisible();
        expect(api.book).not.toHaveBeenCalled();
    });
    it("allows an explicitly chosen earlier proposal inside the tolerance band", async () => {
        api.slots.mockResolvedValue({ data: { ...found, earlierAlternatives: [{ ...found.future[0], clinic: { _id: "tolerance-clinic", nom: "Tolerance synthetic clinic", distanceKm: 105.6 }, prioritySpecialty: "IPS" }] } });
        render(<Page />); await searchNew();
        fireEvent.click(screen.getAllByRole("button", { name: /09:00/ }).at(-1)!);
        fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Fictional" } });
        fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "WalkIn" } });
        fireEvent.click(screen.getByRole("button", { name: "Create patient and appointment" }));
        await screen.findByRole("button", { name: "Search for patient" });
        expect(api.book).toHaveBeenCalledWith(expect.objectContaining({clinic:"tolerance-clinic",originClinic:"origin",selectionMode:"earlier"}));
    });
    it.each([100.01, 105.6])("keeps a legacy response without tolerance metadata limited to 100 km (%s)", async distanceKm => {
        const search={radiusKm:100,status:"found",distanceMode:"straight_line",examinedClinics:2};
        api.slots.mockResolvedValue({ data: { ...found, search, selectedClinic:{...found.selectedClinic,distanceKm} } });
        render(<Page />); await searchNew();
        expect(screen.getByText(walkInRoutingLabels("en-CA").locationMissingTitle)).toBeVisible();
        expect(screen.queryByRole("button",{name:/09:00/})).not.toBeInTheDocument();
    });
    it.each([{toleranceKm:10},{maxDistanceKm:110},{toleranceKm:20,maxDistanceKm:120},{toleranceKm:10,maxDistanceKm:111}])("does not expand the radius from partial or inconsistent metadata %j", async metadata => {
        api.slots.mockResolvedValue({ data:{ ...found, search:{radiusKm:100,status:"exhausted",distanceMode:"straight_line",examinedClinics:2,...metadata},today:[],future:[] } });
        render(<Page />); await searchNew();
        expect(screen.getByText(walkInRoutingLabels("en-CA").locationMissingTitle)).toBeVisible();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(api.book).not.toHaveBeenCalled();
    });
    it.each([110.0001,133.4])("does not offer a destination beyond the unrounded effective limit (%s km)", async distanceKm => {
        api.slots.mockResolvedValue({data:{...found,selectedClinic:{...found.selectedClinic,distanceKm}}});
        render(<Page/>); await searchNew();
        expect(screen.getByText(walkInRoutingLabels("en-CA").locationMissingTitle)).toBeVisible();
        expect(screen.queryByRole("button",{name:/09:00/})).not.toBeInTheDocument();
    });

    it.each(["IPS","Urgentologue"] as const)("uses generic appointment labels for the routed %s profession",async specialty=>{
        api.slots.mockResolvedValue({data:{...found,prioritySpecialty:specialty}});
        render(<Page/>);await searchNew();const t=walkInRoutingLabels("en-CA");
        expect(screen.getByText(t.routedToday)).toBeVisible();expect(screen.getByText(t.routedNoToday)).toBeVisible();expect(screen.getByText(t.routedFuture)).toBeVisible();
        expect(screen.queryByText("Doctors available today")).not.toBeInTheDocument();
        expect(screen.queryByText(/No family physician/)).not.toBeInTheDocument();
    });
    it.each([false,true])("propagates existing patient and replacement=%s context into every earlier proposal",async replacing=>{
        const original={_id:"synthetic-original",date:"2030-02-01",time:"14:00"};
        api.lookup.mockResolvedValue({data:{_id:"known",bookingProof:"synthetic-proof",prenom:"Fictional",nom:"Known",existingAppointments:replacing?[original]:[]}});
        api.slots.mockResolvedValue({data:{...found,earlierAlternatives:[{...found.future[0],clinic:{_id:"alternative",nom:"Alternative synthetic clinic",distanceKm:42},prioritySpecialty:"IPS"}]}});
        render(<Page/>);fireEvent.change(screen.getByRole("textbox"),{target:{value:"SYNTHETIC-INSURANCE"}});fireEvent.click(screen.getByRole("button",{name:"Search for patient"}));fireEvent.click(await screen.findByRole("button",{name:/Select/}));
        fireEvent.click(screen.getByRole("button",{name:replacing?receptionReplanLabels("en-CA").start:"View available appointments"}));
        await screen.findByText(walkInRoutingLabels("en-CA").earlierOffers.replace("{maxDistance}","110"));
        const correct=replacing?receptionReplanLabels("en-CA").kept:walkInRoutingLabels("en-CA").existingAvailabilityIntro;
        expect(screen.getAllByText(correct).length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByText(/The patient record and appointment will be created/)).not.toBeInTheDocument();
        expect(api.book).not.toHaveBeenCalled();
    });

});
